/**
 * Unified HR inbox.
 *
 * Items are derived from the underlying records every time (never stored as copies), so acting on
 * an item — approving, completing, acknowledging — changes the real record and the item disappears.
 * Only per-user snooze state is stored separately.
 */
import { daysBetween, today } from '@/lib/dates'
import { fullName } from '@/lib/utils'
import { activeStep, canDecide } from './approvals'
import { can, isHR } from './permissions'
import { isOverdue, isOpenRequest } from './sla'
import type { Account, Database, Employee, ID, Priority } from './types'

export type InboxKind =
  | 'leave_approval'
  | 'request_approval'
  | 'record_update'
  | 'request'
  | 'request_followup'
  | 'leave_followup'
  | 'lifecycle_task'
  | 'document_review'
  | 'task'
  | 'policy_ack'

export interface InboxItem {
  key: string
  kind: InboxKind
  title: string
  context: string
  employee: Employee | null
  ownerId: ID | null
  ownerLabel: string
  priority: Priority
  /** Calendar date or ISO timestamp. */
  due: string | null
  overdue: boolean
  status: string
  href: string
  /** Record ids needed by inline actions. */
  ref: { id: ID; parentId?: ID }
}

export const KIND_LABELS: Record<InboxKind, string> = {
  leave_approval: 'Leave approval',
  request_approval: 'Request approval',
  record_update: 'Record update',
  request: 'Service request',
  request_followup: 'Your request',
  leave_followup: 'Your leave',
  lifecycle_task: 'Checklist task',
  document_review: 'Document review',
  task: 'Task',
  policy_ack: 'Policy acknowledgment',
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

export function buildInbox(db: Database, account: Account, now: Date = new Date()): InboxItem[] {
  const T = today(now)
  const emp = (id: ID | null | undefined) => db.employees.find((e) => e.id === id) ?? null
  const name = (id: ID | null | undefined) => (id ? (db.accounts.find((a) => a.id === id)?.name ?? 'Unknown') : 'HR queue')
  const items: InboxItem[] = []
  const hr = isHR(account)

  for (const l of db.leaveRequests) {
    const e = emp(l.employeeId)
    const type = db.leaveTypes.find((t) => t.id === l.leaveTypeId)
    if (l.status === 'pending' && canDecide(l.approvals, account.id)) {
      const step = activeStep(l.approvals)
      items.push({
        key: `leave:${l.id}`,
        kind: 'leave_approval',
        title: `${type?.name ?? 'Leave'} · ${l.days} day${l.days === 1 ? '' : 's'}`,
        context: `${l.startDate} → ${l.endDate}${l.reason ? ` · “${l.reason}”` : ''} · ${step?.stageName ?? ''}`,
        employee: e,
        ownerId: account.id,
        ownerLabel: 'You',
        priority: daysBetween(T, l.startDate) <= 3 ? 'high' : 'normal',
        due: l.startDate,
        overdue: l.startDate < T,
        status: 'Awaiting your decision',
        href: `/leave/${l.id}`,
        ref: { id: l.id },
      })
    }
    if (l.status === 'changes_requested' && (l.employeeId === account.employeeId || l.requestedBy === account.id)) {
      items.push({
        key: `leavefix:${l.id}`,
        kind: 'leave_followup',
        title: `Update your ${type?.name.toLowerCase() ?? 'leave'} request`,
        context: l.approvals.find((s) => s.decision === 'changes_requested')?.comment ?? '',
        employee: e,
        ownerId: account.id,
        ownerLabel: 'You',
        priority: 'normal',
        due: l.startDate,
        overdue: false,
        status: 'Changes requested',
        href: `/leave/${l.id}`,
        ref: { id: l.id },
      })
    }
  }

  for (const r of db.requests) {
    const e = emp(r.employeeId)
    const type = db.requestTypes.find((t) => t.id === r.typeId)
    const overdue = isOverdue(r, now.getTime())
    if (r.status === 'pending_approval' && canDecide(r.approvals, account.id)) {
      const isUpdate = type?.kind === 'record_update'
      items.push({
        key: `reqapr:${r.id}`,
        kind: isUpdate ? 'record_update' : 'request_approval',
        title: r.subject,
        context: `${r.number} · ${type?.name ?? ''} · ${activeStep(r.approvals)?.stageName ?? ''}`,
        employee: e,
        ownerId: account.id,
        ownerLabel: 'You',
        priority: r.priority,
        due: r.dueAt,
        overdue,
        status: 'Awaiting your decision',
        href: `/requests/${r.id}`,
        ref: { id: r.id },
      })
      continue
    }
    if (
      hr &&
      isOpenRequest(r) &&
      r.status !== 'pending_approval' &&
      r.status !== 'changes_requested' &&
      (r.assigneeId === account.id || r.assigneeId === null)
    ) {
      items.push({
        key: `req:${r.id}`,
        kind: 'request',
        title: r.subject,
        context: `${r.number} · ${type?.name ?? ''}${r.escalatedAt ? ' · escalated' : ''}`,
        employee: e,
        ownerId: r.assigneeId,
        ownerLabel: r.assigneeId ? 'You' : 'Unassigned',
        priority: r.priority,
        due: r.dueAt,
        overdue,
        status:
          r.status === 'waiting_on_employee'
            ? 'Waiting on employee'
            : r.status === 'approved'
              ? 'Approved — fulfil'
              : r.status === 'in_progress'
                ? 'In progress'
                : 'Open',
        href: `/requests/${r.id}`,
        ref: { id: r.id },
      })
    }
    if (r.requesterId === account.id && (r.status === 'waiting_on_employee' || r.status === 'changes_requested')) {
      items.push({
        key: `reqfix:${r.id}`,
        kind: 'request_followup',
        title: r.subject,
        context: r.status === 'changes_requested' ? 'HR or your approver asked for changes' : 'HR needs more information from you',
        employee: e,
        ownerId: account.id,
        ownerLabel: 'You',
        priority: r.priority,
        due: null,
        overdue: false,
        status: r.status === 'changes_requested' ? 'Changes requested' : 'Reply needed',
        href: `/requests/${r.id}`,
        ref: { id: r.id },
      })
    }
  }

  for (const c of db.lifecycleCases.filter((x) => x.status === 'active')) {
    const e = emp(c.employeeId)
    for (const t of c.tasks.filter((x) => x.status === 'open')) {
      const mine = t.assigneeId === account.id || (t.assigneeId === null && can(account, 'lifecycle.manage'))
      if (!mine) continue
      const review = hr && t.requiresDocument && Boolean(t.documentId)
      items.push({
        key: `lct:${t.id}`,
        kind: review ? 'document_review' : 'lifecycle_task',
        title: review ? `Review document: ${t.title}` : t.title,
        context: `${c.kind === 'onboarding' ? 'Onboarding' : 'Offboarding'} · ${c.kind === 'onboarding' ? 'joins' : 'last day'} ${c.keyDate}${t.externalAction ? ' · external system action' : ''}`,
        employee: e,
        ownerId: t.assigneeId,
        ownerLabel: t.assigneeId === account.id ? 'You' : 'HR queue',
        priority: t.dueDate < T ? 'high' : 'normal',
        due: t.dueDate,
        overdue: t.dueDate < T,
        status: review ? 'Document uploaded' : 'Open',
        href: `/lifecycle/${c.id}`,
        ref: { id: t.id, parentId: c.id },
      })
    }
  }

  for (const t of db.tasks.filter((x) => x.status === 'open')) {
    if (!(t.assigneeId === account.id || (t.assigneeId === null && hr))) continue
    const e = t.link?.type === 'employee' ? emp(t.link.id) : null
    items.push({
      key: `task:${t.id}`,
      kind: 'task',
      title: t.title,
      context: t.description || (t.sourceKey ? 'Created by automation' : `Created by ${name(t.createdBy)}`),
      employee: e,
      ownerId: t.assigneeId,
      ownerLabel: t.assigneeId === account.id ? 'You' : 'HR queue',
      priority: t.priority,
      due: t.dueDate,
      overdue: Boolean(t.dueDate && t.dueDate < T),
      status: 'Open',
      href: e ? `/people/${e.id}` : '/inbox',
      ref: { id: t.id },
    })
  }

  if (account.employeeId) {
    const me = emp(account.employeeId)
    for (const p of db.policies.filter((x) => x.status === 'published' && x.requiresAcknowledgment && x.publishedVersion !== null)) {
      const inAudience = !p.audienceDepartmentIds || (me && p.audienceDepartmentIds.includes(me.departmentId))
      const acked = db.policyAcks.some((a) => a.policyId === p.id && a.version === p.publishedVersion && a.employeeId === account.employeeId)
      if (inAudience && !acked)
        items.push({
          key: `ack:${p.id}:${p.publishedVersion}`,
          kind: 'policy_ack',
          title: `Read and acknowledge: ${p.title}`,
          context: `Version ${p.publishedVersion}`,
          employee: me,
          ownerId: account.id,
          ownerLabel: 'You',
          priority: 'normal',
          due: null,
          overdue: false,
          status: 'Not acknowledged',
          href: `/policies/${p.id}`,
          ref: { id: p.id },
        })
    }
  }

  return items.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due ?? '9999').localeCompare(b.due ?? '9999'),
  )
}

export function isSnoozed(db: Pick<Database, 'inboxState'>, accountId: ID, key: string, now = Date.now()): boolean {
  const s = db.inboxState.find((x) => x.accountId === accountId && x.itemKey === key)
  return Boolean(s?.snoozedUntil && new Date(s.snoozedUntil).getTime() > now)
}

export const employeeName = (e: Employee | null) => (e ? fullName(e) : '—')
