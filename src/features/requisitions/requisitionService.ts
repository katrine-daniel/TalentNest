/**
 * Job requisitions and their approval workflow:
 *   draft → pending → approved | rejected | revision-requested → (edit) → pending …
 * Only the assigned approver (or an Admin) may decide; requesters cannot approve their own requisition.
 */
import { dataStore } from '@/services/storage/dataStore'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, pushNotification } from '@/services/activityService'
import { createId } from '@/utils/ids'
import type { Requisition, RequisitionEvent, RequisitionStatus } from '@/types/domain'

export interface RequisitionInput {
  title: string
  departmentId: string
  justification: string
  headcount: number
  budgetMin: number
  budgetMax: number
  hiringManagerId: string
  approverId: string
}

export function validateRequisition(v: RequisitionInput): string[] {
  const errors: string[] = []
  if (v.title.trim().length < 4) errors.push('Use a descriptive title (4+ characters).')
  if (!v.departmentId) errors.push('Choose a department.')
  if (v.justification.trim().length < 30) errors.push('Explain the business need (30+ characters).')
  if (!(Number(v.headcount) >= 1 && Number(v.headcount) <= 200)) errors.push('Headcount must be between 1 and 200.')
  if (!(Number(v.budgetMin) > 0)) errors.push('Enter a minimum salary budget.')
  if (Number(v.budgetMax) < Number(v.budgetMin)) errors.push('Maximum budget must be at least the minimum.')
  if (!v.hiringManagerId) errors.push('Assign a hiring manager.')
  if (!v.approverId) errors.push('Assign an approver.')
  return errors
}

/** Which transitions are allowed from each status, and by whom. */
export const DECISIONS: Record<
  'approve' | 'reject' | 'request-revision',
  { to: RequisitionStatus; action: RequisitionEvent['action']; requiresComment: boolean }
> = {
  approve: { to: 'approved', action: 'approved', requiresComment: false },
  reject: { to: 'rejected', action: 'rejected', requiresComment: true },
  'request-revision': { to: 'revision-requested', action: 'revision-requested', requiresComment: true },
}

function event(action: RequisitionEvent['action'], byId: string, comment = ''): RequisitionEvent {
  return { id: createId('rh'), action, byId, at: new Date().toISOString(), comment }
}

function patch(id: string, updater: (r: Requisition) => Requisition) {
  let updated: Requisition | undefined
  dataStore.write('requisitions', (list) => list.map((r) => (r.id === id ? (updated = updater(r)) : r)))
  if (!updated) throw new ServiceError('Requisition not found', 'not-found')
  return updated
}

export function canDecide(req: Requisition, actor: { id: string; role: string }) {
  if (req.status !== 'pending') return false
  if (req.createdById === actor.id && actor.role !== 'Admin') return false
  return req.approverId === actor.id || actor.role === 'Admin'
}

export const requisitionService = {
  async create(values: RequisitionInput, { actorId, submit }: { actorId: string; submit: boolean }) {
    const errors = validateRequisition(values)
    if (errors.length) throw new ServiceError(errors.join(' '))
    return mockRequest(() => {
      const now = new Date().toISOString()
      const req: Requisition = {
        ...values,
        title: values.title.trim(),
        justification: values.justification.trim(),
        headcount: Number(values.headcount),
        budgetMin: Number(values.budgetMin),
        budgetMax: Number(values.budgetMax),
        id: createId('req'),
        status: submit ? 'pending' : 'draft',
        jobId: null,
        createdById: actorId,
        createdAt: now,
        updatedAt: now,
        history: [event('created', actorId), ...(submit ? [event('submitted', actorId)] : [])],
      }
      dataStore.write('requisitions', (list) => [req, ...list])
      if (submit)
        pushNotification({
          type: 'requisition',
          title: 'Requisition awaiting approval',
          body: `${req.title} (${req.headcount} position${req.headcount > 1 ? 's' : ''})`,
          link: `/requisitions?id=${req.id}`,
          userId: req.approverId,
        })
      logActivity({ type: 'requisition', text: `Requisition ${submit ? 'submitted' : 'drafted'}: ${req.title}`, actorId })
      return req
    })
  },

  /** Editing is allowed for drafts and revision requests; it returns the requisition to draft. */
  async update(id: string, values: RequisitionInput, { actorId }: { actorId: string }) {
    const errors = validateRequisition(values)
    if (errors.length) throw new ServiceError(errors.join(' '))
    return mockRequest(() =>
      patch(id, (r) => {
        if (!['draft', 'revision-requested'].includes(r.status)) throw new ServiceError('Only drafts or requisitions with requested revisions can be edited')
        return {
          ...r,
          ...values,
          headcount: Number(values.headcount),
          budgetMin: Number(values.budgetMin),
          budgetMax: Number(values.budgetMax),
          status: 'draft',
          updatedAt: new Date().toISOString(),
          history: [...r.history, event('edited', actorId)],
        }
      }),
    )
  },

  async submit(id: string, { actorId }: { actorId: string }) {
    return mockRequest(() => {
      const updated = patch(id, (r) => {
        if (!['draft', 'revision-requested'].includes(r.status)) throw new ServiceError('This requisition has already been submitted')
        return { ...r, status: 'pending', updatedAt: new Date().toISOString(), history: [...r.history, event('submitted', actorId)] }
      })
      pushNotification({
        type: 'requisition',
        title: 'Requisition awaiting approval',
        body: updated.title,
        link: `/requisitions?id=${id}`,
        userId: updated.approverId,
      })
      return updated
    })
  },

  async decide(id: string, decision: keyof typeof DECISIONS, { actor, comment = '' }: { actor: { id: string; role: string }; comment?: string }) {
    const rule = DECISIONS[decision]
    if (rule.requiresComment && !comment.trim()) throw new ServiceError('Add a comment explaining the decision')
    return mockRequest(() => {
      const current = dataStore.read('requisitions').find((r) => r.id === id)
      if (!current) throw new ServiceError('Requisition not found', 'not-found')
      if (!canDecide(current, actor)) throw new ServiceError('Only the assigned approver can decide on this requisition, and not on their own request')
      const updated = patch(id, (r) => ({
        ...r,
        status: rule.to,
        updatedAt: new Date().toISOString(),
        history: [...r.history, event(rule.action, actor.id, comment.trim())],
      }))
      pushNotification({
        type: 'requisition',
        title: `Requisition ${rule.to.replace('-', ' ')}`,
        body: `${updated.title}${comment ? ` — ${comment}` : ''}`,
        link: `/requisitions?id=${id}`,
        userId: updated.createdById,
      })
      logActivity({ type: 'requisition', text: `Requisition ${rule.to.replace('-', ' ')}: ${updated.title}`, actorId: actor.id })
      return updated
    })
  },
}
