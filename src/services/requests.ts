/**
 * HR service desk and employee requests.
 *
 * Status transitions (enforced here and by the database trigger):
 *   open               → in_progress | waiting_on_employee | resolved | cancelled
 *   in_progress        → waiting_on_employee | resolved | cancelled
 *   waiting_on_employee→ in_progress (also automatic when the employee replies)
 *   pending_approval   → approved | rejected | changes_requested (by approvers only) | cancelled
 *   changes_requested  → pending_approval (requester resubmits) | cancelled
 *   approved           → in_progress | resolved
 *   resolved           → closed | in_progress (reopen)
 * Record-update requests apply their proposed changes to the employee record when approved.
 */
import { createId, nowISO } from '@/lib/utils'
import { buildSteps, canDecide, decide, delegate as delegateStep, hrHandlers, type Decision } from '@/domain/approvals'
import { can, canViewRequest, isHR } from '@/domain/permissions'
import { addBusinessHours, isOverdue } from '@/domain/sla'
import type { Account, Attachment, Database, HRRequest, ID, Priority, RequestStatus } from '@/domain/types'
import { queueEvent, withAudit, withNotifications } from './activity'
import { applyEmployeePatch } from './employees'
import { files } from './files'
import { replaceById, ServiceError, store } from './store'
import { required, transact } from './tx'

export const STATUS_LABELS: Record<RequestStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_employee: 'Waiting on employee',
  pending_approval: 'Pending approval',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

const HR_TRANSITIONS: Partial<Record<RequestStatus, RequestStatus[]>> = {
  open: ['in_progress', 'waiting_on_employee', 'resolved', 'cancelled'],
  in_progress: ['waiting_on_employee', 'resolved', 'cancelled'],
  waiting_on_employee: ['in_progress', 'resolved', 'cancelled'],
  pending_approval: ['cancelled'],
  changes_requested: ['cancelled'],
  approved: ['in_progress', 'resolved'],
  resolved: ['closed', 'in_progress'],
}

export function allowedTransitions(request: HRRequest, actor: Account): RequestStatus[] {
  if (isHR(actor)) return HR_TRANSITIONS[request.status] ?? []
  const own = request.requesterId === actor.id
  if (!own) return []
  if (['open', 'in_progress', 'waiting_on_employee', 'pending_approval', 'changes_requested'].includes(request.status)) return ['cancelled']
  if (request.status === 'resolved') return ['closed', 'in_progress']
  return []
}

/** Requests the account may see, with internal comments removed for non-HR viewers. */
export function visibleRequests(db: Database, account: Account): HRRequest[] {
  const hr = isHR(account)
  return db.requests.filter((r) => canViewRequest(account, r, db)).map((r) => (hr ? r : { ...r, comments: r.comments.filter((c) => !c.internal) }))
}

function getVisible(id: ID, actor: Account): HRRequest {
  const r = store.db.requests.find((x) => x.id === id)
  if (!r || !canViewRequest(actor, r, store.db)) throw new ServiceError('Request not found.', 'not_found')
  return r
}

function nextNumber(db: Database): string {
  const max = db.requests.reduce((m, r) => Math.max(m, Number(r.number.replace(/\D/g, '')) || 0), 1000)
  return `HR-${max + 1}`
}

const accountOf = (db: Database, employeeId: ID | null | undefined) => db.accounts.find((a) => a.employeeId === employeeId)

export interface RequestInput {
  typeId: ID
  subject: string
  description: string
  priority?: Priority
  /** HR may raise on behalf of an employee; defaults to the requester. */
  employeeId?: ID
  proposedChanges?: Record<string, string> | null
}

export const UPDATABLE_FIELDS: Record<string, string> = { phone: 'Phone', personalEmail: 'Personal email', preferredName: 'Preferred name' }

export async function createRequest(actor: Account, input: RequestInput, attachments: File[] = []): Promise<HRRequest> {
  const db = store.db
  const type = db.requestTypes.find((t) => t.id === input.typeId && t.active)
  if (!type) throw new ServiceError('Choose a request type.')
  const employeeId = input.employeeId && input.employeeId !== actor.employeeId ? input.employeeId : actor.employeeId
  if (!employeeId) throw new ServiceError('Your account is not linked to an employee record, so choose who the request is for.')
  if (employeeId !== actor.employeeId && !can(actor, 'requests.handle')) throw new ServiceError('You can only raise requests for yourself.', 'forbidden')
  if (!type.selfService && !can(actor, 'requests.handle')) throw new ServiceError('This request type is raised by HR.', 'forbidden')
  const subject = db.employees.find((e) => e.id === employeeId)
  if (!subject) throw new ServiceError('Employee not found.', 'not_found')
  const title = required(input.subject, 'Subject')
  if (title.length > 140) throw new ServiceError('Keep the subject under 140 characters.')
  let proposed: Record<string, string> | null = null
  if (type.kind === 'record_update') {
    proposed = Object.fromEntries(Object.entries(input.proposedChanges ?? {}).filter(([k, v]) => k in UPDATABLE_FIELDS && v.trim()))
    if (!Object.keys(proposed).length) throw new ServiceError('Enter at least one new value.')
  }

  const uploaded: Attachment[] = []
  for (const file of attachments) {
    const s = await files.upload(file, `requests`)
    uploaded.push({ id: createId('att'), name: s.name, size: s.size, mimeType: s.mimeType, fileId: s.fileId, uploadedBy: actor.id, uploadedAt: nowISO() })
  }

  const now = nowISO()
  const approvals = buildSteps(db, type.approvalChain, subject, actor.id)
  const request: HRRequest = {
    id: createId('req'),
    number: nextNumber(db),
    typeId: type.id,
    category: type.category,
    subject: title,
    description: input.description.trim(),
    requesterId: actor.id,
    employeeId,
    priority: input.priority ?? type.defaultPriority,
    status: approvals.length ? 'pending_approval' : 'open',
    assigneeId: null,
    dueAt: addBusinessHours(new Date(), type.slaHours).toISOString(),
    proposedChanges: proposed,
    approvals,
    comments: [],
    attachments: uploaded,
    timeline: [{ id: createId('tl'), at: now, by: actor.id, text: employeeId === actor.employeeId ? 'Request submitted' : `Raised by ${actor.name} on behalf of the employee` }],
    resolution: null,
    escalatedAt: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  }
  queueEvent({ type: 'request.submitted', entity: { type: 'request', id: request.id }, employeeId, actorId: actor.id, data: { 'request.category': type.category, 'request.type': type.name, subject: title, priority: request.priority } })
  const first = approvals[0]
  transact((d) =>
    withNotifications(withAudit({ ...d, requests: [request, ...d.requests] }, actor.id, 'request.created', { type: 'request', id: request.id }, `${request.number} ${title}`), [
      ...(first ? first.approverIds.map((id) => ({ accountId: id, title: `Approval needed: ${title}`, body: `${request.number} · ${type.name}`, link: `/requests/${request.id}`, kind: 'request' as const })) : []),
      ...(!first ? hrHandlers(d).map((a) => ({ accountId: a.id, title: `New request: ${title}`, body: `${request.number} · ${type.name}`, link: `/requests/${request.id}`, kind: 'request' as const })) : []),
    ]),
  )
  return request
}

function update(db: Database, id: ID, actorId: ID, text: string, patch: Partial<HRRequest>): Database {
  return { ...db, requests: replaceById(db.requests, id, (r) => ({ ...r, ...patch, updatedAt: nowISO(), timeline: [...r.timeline, { id: createId('tl'), at: nowISO(), by: actorId, text }] })) }
}

export function addComment(actor: Account, id: ID, text: string, internal: boolean) {
  const r = getVisible(id, actor)
  const body = required(text, 'Comment')
  if (internal && !isHR(actor)) throw new ServiceError('Only HR can add internal notes.', 'forbidden')
  if (['closed', 'cancelled'].includes(r.status)) throw new ServiceError('This request is closed. Raise a new request instead.')
  const comment = { id: createId('cm'), authorId: actor.id, text: body, internal, at: nowISO() }
  const resumes = r.status === 'waiting_on_employee' && r.requesterId === actor.id
  transact((d) => {
    let next: Database = { ...d, requests: replaceById(d.requests, id, (x) => ({ ...x, comments: [...x.comments, comment], updatedAt: nowISO(), status: resumes ? 'in_progress' : x.status })) }
    if (resumes) next = update(next, id, actor.id, 'Employee replied — back in progress', {})
    if (internal) return next
    const notify = actor.id === r.requesterId ? (r.assigneeId ? [r.assigneeId] : hrHandlers(d).map((a) => a.id)) : [r.requesterId]
    return withNotifications(next, notify.map((accountId) => ({ accountId, title: `New comment on ${r.number}`, body: body.slice(0, 120), link: `/requests/${id}`, kind: 'request' as const })))
  })
}

export function assignRequest(actor: Account, id: ID, assigneeId: ID | null) {
  if (!isHR(actor)) throw new ServiceError('Only HR can assign requests.', 'forbidden')
  getVisible(id, actor)
  const assignee = assigneeId ? store.db.accounts.find((a) => a.id === assigneeId) : null
  if (assigneeId && (!assignee || !isHR(assignee))) throw new ServiceError('Requests can only be assigned to HR staff.')
  transact((d) => {
    const r = d.requests.find((x) => x.id === id) as HRRequest
    let next = update(d, id, actor.id, assignee ? `Assigned to ${assignee.name}` : 'Unassigned', { assigneeId, status: r.status === 'open' && assignee ? 'in_progress' : r.status })
    next = withAudit(next, actor.id, 'request.assigned', { type: 'request', id }, assignee ? `Assigned to ${assignee.name}` : 'Unassigned')
    return assignee && assignee.id !== actor.id ? withNotifications(next, [{ accountId: assignee.id, title: `Assigned to you: ${r.subject}`, body: r.number, link: `/requests/${id}`, kind: 'request' }]) : next
  })
}

export function changeStatus(actor: Account, id: ID, status: RequestStatus, note = '') {
  const r = getVisible(id, actor)
  if (!allowedTransitions(r, actor).includes(status)) throw new ServiceError(`A request that is ${STATUS_LABELS[r.status].toLowerCase()} cannot be moved to ${STATUS_LABELS[status].toLowerCase()}.`, 'conflict')
  if (status === 'resolved' && !note.trim() && !r.resolution) throw new ServiceError('Add a resolution note so the employee knows the outcome.')
  if (status === 'waiting_on_employee' && !note.trim()) throw new ServiceError('Tell the employee what you need from them.')
  const patch: Partial<HRRequest> = { status }
  if (status === 'resolved') Object.assign(patch, { resolution: note.trim() || r.resolution, resolvedAt: nowISO() })
  if (status === 'in_progress' && r.status === 'resolved') Object.assign(patch, { resolvedAt: null })
  transact((d) => {
    let next = update(d, id, actor.id, `Status: ${STATUS_LABELS[status]}${note.trim() ? ` — ${note.trim()}` : ''}`, patch)
    if (status === 'waiting_on_employee') next = { ...next, requests: replaceById(next.requests, id, (x) => ({ ...x, comments: [...x.comments, { id: createId('cm'), authorId: actor.id, text: note.trim(), internal: false, at: nowISO() }] })) }
    next = withAudit(next, actor.id, 'request.status', { type: 'request', id }, `${r.number}: ${STATUS_LABELS[r.status]} → ${STATUS_LABELS[status]}`)
    return actor.id === r.requesterId ? next : withNotifications(next, [{ accountId: r.requesterId, title: `${r.number} is now ${STATUS_LABELS[status].toLowerCase()}`, body: r.subject, link: `/requests/${id}`, kind: 'request' }])
  })
}

export function decideRequest(actor: Account, id: ID, decision: Decision, comment: string) {
  const r = getVisible(id, actor)
  if (r.status !== 'pending_approval') throw new ServiceError('This request is not awaiting approval.', 'conflict')
  if (!canDecide(r.approvals, actor.id)) throw new ServiceError('You are not an approver for the current step.', 'forbidden')
  let result
  try {
    result = decide(r.approvals, actor.id, decision, comment, nowISO())
  } catch (e) {
    throw new ServiceError((e as Error).message)
  }
  const type = store.db.requestTypes.find((t) => t.id === r.typeId)
  const status: RequestStatus = result.outcome === 'pending' ? 'pending_approval' : result.outcome === 'approved' ? (type?.kind === 'record_update' ? 'resolved' : 'approved') : result.outcome
  if (result.outcome !== 'pending') queueEvent({ type: 'request.decided', entity: { type: 'request', id }, employeeId: r.employeeId, actorId: actor.id, data: { 'request.category': r.category, 'request.type': type?.name ?? '', decision: result.outcome, subject: r.subject } })
  transact((d) => {
    const label = decision === 'approved' ? 'Approved' : decision === 'rejected' ? 'Rejected' : 'Changes requested'
    let next = update(d, id, actor.id, `${label} by ${actor.name}${comment.trim() ? `: ${comment.trim()}` : ''}`, {
      approvals: result.steps,
      status,
      ...(status === 'resolved' ? { resolvedAt: nowISO(), resolution: 'Approved — the employee record has been updated.' } : {}),
      ...(status === 'rejected' ? { resolvedAt: nowISO(), resolution: comment.trim() } : {}),
    })
    // Approved record updates are applied to the employee record with the approver as the actor.
    if (status === 'resolved' && r.proposedChanges) next = applyEmployeePatch(next, r.employeeId, r.proposedChanges, actor.id, `Approved request ${r.number}`)
    next = withAudit(next, actor.id, `request.${decision}`, { type: 'request', id }, `${r.number} ${label.toLowerCase()}`)
    const active = result.steps.find((s) => s.decision === 'pending')
    return withNotifications(next, [
      { accountId: r.requesterId, title: `${r.number}: ${label.toLowerCase()}`, body: comment.trim() || r.subject, link: `/requests/${id}`, kind: 'request' },
      ...(result.outcome === 'pending' && active ? active.approverIds.map((a) => ({ accountId: a, title: `Approval needed: ${r.subject}`, body: `${r.number} · ${active.stageName}`, link: `/requests/${id}`, kind: 'request' as const })) : []),
      ...(status === 'approved' ? hrHandlers(d).map((a) => ({ accountId: a.id, title: `Approved, ready to fulfil: ${r.subject}`, body: r.number, link: `/requests/${id}`, kind: 'request' as const })) : []),
    ])
  })
}

export function delegateApproval(actor: Account, id: ID, toAccountId: ID) {
  const r = getVisible(id, actor)
  const db = store.db
  const subject = db.employees.find((e) => e.id === r.employeeId)
  const eligible = db.accounts.filter((a) => a.status === 'active' && a.id !== r.requesterId && a.employeeId !== subject?.id && (a.role !== 'employee' || isHR(a))).map((a) => a.id)
  let steps
  try {
    steps = delegateStep(r.approvals, actor.id, toAccountId, eligible)
  } catch (e) {
    throw new ServiceError((e as Error).message)
  }
  const to = db.accounts.find((a) => a.id === toAccountId)
  transact((d) => withNotifications(update(d, id, actor.id, `Approval delegated to ${to?.name}`, { approvals: steps }), [{ accountId: toAccountId, title: `Approval delegated to you: ${r.subject}`, body: r.number, link: `/requests/${id}`, kind: 'request' }]))
}

/** Requester updates the request after "changes requested"; the approval chain restarts. */
export function resubmitRequest(actor: Account, id: ID, description: string, proposedChanges?: Record<string, string> | null) {
  const r = getVisible(id, actor)
  if (r.requesterId !== actor.id) throw new ServiceError('Only the requester can resubmit.', 'forbidden')
  if (r.status !== 'changes_requested') throw new ServiceError('This request is not waiting for changes.', 'conflict')
  const db = store.db
  const type = db.requestTypes.find((t) => t.id === r.typeId)
  const subject = db.employees.find((e) => e.id === r.employeeId)
  if (!type || !subject) throw new ServiceError('The request type or employee no longer exists.')
  const steps = buildSteps(db, type.approvalChain, subject, actor.id)
  transact((d) =>
    withNotifications(update(d, id, actor.id, 'Resubmitted with changes', { description: description.trim() || r.description, proposedChanges: proposedChanges ?? r.proposedChanges, approvals: steps, status: 'pending_approval' }), (steps[0]?.approverIds ?? []).map((a) => ({ accountId: a, title: `Resubmitted for approval: ${r.subject}`, body: r.number, link: `/requests/${id}`, kind: 'request' as const }))),
  )
}

export async function openAttachment(actor: Account, requestId: ID, attachmentId: ID): Promise<string> {
  const r = getVisible(requestId, actor)
  const att = r.attachments.find((a) => a.id === attachmentId)
  if (!att) throw new ServiceError('Attachment not found.', 'not_found')
  return files.open(att.fileId)
}

/** Escalation of overdue requests (scheduled check). Returns the ids escalated. */
export function escalateOverdue(now = Date.now()): ID[] {
  const db = store.db
  const due = db.requests.filter((r) => isOverdue(r, now) && !r.escalatedAt)
  if (!due.length) return []
  transact((d) => {
    let next = d
    for (const r of due) {
      next = update(next, r.id, 'system', 'Escalated — past its service target', { escalatedAt: new Date(now).toISOString(), priority: r.priority === 'urgent' ? 'urgent' : 'high' })
      queueEvent({ type: 'task.overdue', entity: { type: 'request', id: r.id }, employeeId: r.employeeId, actorId: null, data: { 'entity.type': 'request', subject: r.subject, 'request.category': r.category } })
    }
    return withNotifications(
      next,
      due.flatMap((r) => (r.assigneeId ? [r.assigneeId] : hrHandlers(d).map((a) => a.id)).map((accountId) => ({ accountId, title: `Overdue: ${r.subject}`, body: `${r.number} passed its service target`, link: `/requests/${r.id}`, kind: 'request' as const }))),
    )
  })
  return due.map((r) => r.id)
}

export const requestManagerAccount = (db: Database, r: HRRequest) => accountOf(db, db.employees.find((e) => e.id === r.employeeId)?.managerId)
