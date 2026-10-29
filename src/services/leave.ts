/**
 * Leave requests, approvals, cancellation and balance adjustments.
 * Balance and day-count rules live in domain/leave.ts.
 */
import { today } from '@/lib/dates'
import { createId, nowISO } from '@/lib/utils'
import { buildSteps, canDecide, decide, delegate as delegateStep, type Decision } from '@/domain/approvals'
import { validateLeave } from '@/domain/leave'
import { can, canViewLeave } from '@/domain/permissions'
import type { Account, Database, ID, LeaveRequest } from '@/domain/types'
import { queueEvent, withAudit, withNotifications } from './activity'
import { replaceById, ServiceError, store } from './store'
import { transact } from './tx'

export const LEAVE_STATUS_LABELS: Record<LeaveRequest['status'], string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Declined',
  changes_requested: 'Changes requested',
  cancelled: 'Cancelled',
}

export interface LeaveInput {
  employeeId: ID
  leaveTypeId: ID
  startDate: string
  endDate: string
  halfDayStart: boolean
  halfDayEnd: boolean
  reason: string
}

export function visibleLeave(db: Database, account: Account): LeaveRequest[] {
  return db.leaveRequests.filter((l) => canViewLeave(account, l, db))
}

function get(id: ID, actor: Account): LeaveRequest {
  const l = store.db.leaveRequests.find((x) => x.id === id)
  if (!l || !canViewLeave(actor, l, store.db)) throw new ServiceError('Leave request not found.', 'not_found')
  return l
}

function touch(db: Database, id: ID, by: ID, text: string, patch: Partial<LeaveRequest>): Database {
  return {
    ...db,
    leaveRequests: replaceById(db.leaveRequests, id, (l) => ({
      ...l,
      ...patch,
      updatedAt: nowISO(),
      timeline: [...l.timeline, { id: createId('tl'), at: nowISO(), by, text }],
    })),
  }
}

export function requestLeave(actor: Account, input: LeaveInput): LeaveRequest {
  const db = store.db
  const forSelf = input.employeeId === actor.employeeId
  if (!forSelf && !can(actor, 'leave.manage')) throw new ServiceError('You can only request leave for yourself.', 'forbidden')
  const check = validateLeave(db, input)
  if (check.errors.length) throw new ServiceError(check.errors[0] as string)
  const employee = db.employees.find((e) => e.id === input.employeeId)
  const type = db.leaveTypes.find((t) => t.id === input.leaveTypeId)
  if (!employee || !type) throw new ServiceError('Employee or leave type not found.')
  if (['terminated'].includes(employee.status)) throw new ServiceError('Leave cannot be requested for a former employee.')
  const now = nowISO()
  const leave: LeaveRequest = {
    id: createId('lv'),
    ...input,
    reason: input.reason.trim(),
    days: check.days,
    status: 'pending',
    approvals: buildSteps(db, type.approvalChain, employee, actor.id),
    timeline: [{ id: createId('tl'), at: now, by: actor.id, text: forSelf ? 'Leave requested' : `Requested by ${actor.name} on behalf of the employee` }],
    requestedBy: actor.id,
    createdAt: now,
    updatedAt: now,
  }
  // A type without an approval chain is recorded directly — this is explicit configuration, not a silent approval.
  if (!leave.approvals.length) leave.status = 'approved'
  queueEvent({
    type: 'leave.submitted',
    entity: { type: 'leave', id: leave.id },
    employeeId: employee.id,
    actorId: actor.id,
    data: { 'leave.type': type.name, days: leave.days },
  })
  transact((d) =>
    withNotifications(
      withAudit(
        { ...d, leaveRequests: [leave, ...d.leaveRequests] },
        actor.id,
        'leave.requested',
        { type: 'leave', id: leave.id },
        `${type.name}: ${leave.startDate} – ${leave.endDate} (${leave.days} days)`,
      ),
      (leave.approvals[0]?.approverIds ?? []).map((accountId) => ({
        accountId,
        title: `Leave request from ${employee.firstName} ${employee.lastName}`,
        body: `${leave.days} day(s) ${type.name.toLowerCase()}, ${leave.startDate} – ${leave.endDate}`,
        link: `/leave/${leave.id}`,
        kind: 'leave' as const,
      })),
    ),
  )
  return leave
}

export function decideLeave(actor: Account, id: ID, decision: Decision, comment: string) {
  const l = get(id, actor)
  if (l.status !== 'pending') throw new ServiceError('This leave request is not awaiting a decision.', 'conflict')
  if (!canDecide(l.approvals, actor.id)) throw new ServiceError('You are not an approver for this request.', 'forbidden')
  if (decision === 'approved') {
    // Re-check balance and overlaps at decision time — other leave may have been approved since.
    const check = validateLeave(store.db, l, l.id)
    if (check.errors.length) throw new ServiceError(`Cannot approve: ${check.errors[0]}`, 'conflict')
  }
  let result
  try {
    result = decide(l.approvals, actor.id, decision, comment, nowISO())
  } catch (e) {
    throw new ServiceError((e as Error).message)
  }
  const status: LeaveRequest['status'] = result.outcome === 'pending' ? 'pending' : result.outcome
  const employee = store.db.employees.find((e) => e.id === l.employeeId)
  const requesterAccount = store.db.accounts.find((a) => a.employeeId === l.employeeId)?.id ?? l.requestedBy
  if (result.outcome !== 'pending')
    queueEvent({
      type: 'leave.decided',
      entity: { type: 'leave', id },
      employeeId: l.employeeId,
      actorId: actor.id,
      data: { decision: result.outcome, days: l.days },
    })
  const label =
    decision === 'approved'
      ? result.outcome === 'approved'
        ? 'Approved'
        : 'Approved (next step pending)'
      : decision === 'rejected'
        ? 'Declined'
        : 'Changes requested'
  transact((d) => {
    const next = withAudit(
      touch(d, id, actor.id, `${label} by ${actor.name}${comment.trim() ? `: ${comment.trim()}` : ''}`, { approvals: result.steps, status }),
      actor.id,
      `leave.${decision}`,
      { type: 'leave', id },
      `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}: ${label}`,
    )
    const active = result.steps.find((s) => s.decision === 'pending')
    return withNotifications(next, [
      ...(result.outcome !== 'pending'
        ? [
            {
              accountId: requesterAccount,
              title: `Your leave request was ${LEAVE_STATUS_LABELS[status].toLowerCase()}`,
              body: `${l.startDate} – ${l.endDate}${comment.trim() ? ` · ${comment.trim()}` : ''}`,
              link: `/leave/${id}`,
              kind: 'leave' as const,
            },
          ]
        : []),
      ...(result.outcome === 'pending' && active
        ? active.approverIds.map((a) => ({
            accountId: a,
            title: `Leave approval needed: ${employee?.firstName} ${employee?.lastName}`,
            body: active.stageName,
            link: `/leave/${id}`,
            kind: 'leave' as const,
          }))
        : []),
    ])
  })
}

export function delegateLeave(actor: Account, id: ID, toAccountId: ID) {
  const l = get(id, actor)
  const eligible = store.db.accounts.filter((a) => a.status === 'active' && a.employeeId !== l.employeeId && a.role !== 'employee').map((a) => a.id)
  let steps
  try {
    steps = delegateStep(l.approvals, actor.id, toAccountId, eligible)
  } catch (e) {
    throw new ServiceError((e as Error).message)
  }
  const to = store.db.accounts.find((a) => a.id === toAccountId)
  transact((d) =>
    withNotifications(touch(d, id, actor.id, `Delegated to ${to?.name}`, { approvals: steps }), [
      { accountId: toAccountId, title: 'Leave approval delegated to you', body: `${l.startDate} – ${l.endDate}`, link: `/leave/${id}`, kind: 'leave' },
    ]),
  )
}

/**
 * Cancellation: the employee can cancel pending requests, and approved leave that has not started.
 * HR (leave.manage) can cancel any non-final request.
 */
export function cancelLeave(actor: Account, id: ID, reason: string) {
  const l = get(id, actor)
  const own = l.employeeId === actor.employeeId
  const hr = can(actor, 'leave.manage')
  if (!own && !hr) throw new ServiceError('You cannot cancel this request.', 'forbidden')
  if (['cancelled', 'rejected'].includes(l.status)) throw new ServiceError('This request is already closed.', 'conflict')
  if (l.status === 'approved' && l.startDate <= today() && !hr) throw new ServiceError('Leave that has started can only be changed by HR.', 'forbidden')
  transact((d) => {
    const next = withAudit(
      touch(d, id, actor.id, `Cancelled${reason.trim() ? `: ${reason.trim()}` : ''}`, { status: 'cancelled' }),
      actor.id,
      'leave.cancelled',
      { type: 'leave', id },
      `Leave ${l.startDate} – ${l.endDate} cancelled`,
    )
    const approvers = l.approvals.filter((s) => s.decision === 'approved' && s.decidedBy).map((s) => s.decidedBy as ID)
    return withNotifications(
      next,
      approvers.map((accountId) => ({
        accountId,
        title: 'Approved leave was cancelled',
        body: `${l.startDate} – ${l.endDate}`,
        link: `/leave/${id}`,
        kind: 'leave' as const,
      })),
    )
  })
}

/** After "changes requested": the employee edits dates/reason and the approval chain restarts. */
export function resubmitLeave(actor: Account, id: ID, input: Omit<LeaveInput, 'employeeId'>) {
  const l = get(id, actor)
  if (l.employeeId !== actor.employeeId && l.requestedBy !== actor.id) throw new ServiceError('Only the requester can resubmit.', 'forbidden')
  if (l.status !== 'changes_requested') throw new ServiceError('This request is not waiting for changes.', 'conflict')
  const db = store.db
  const check = validateLeave(db, { ...input, employeeId: l.employeeId }, l.id)
  if (check.errors.length) throw new ServiceError(check.errors[0] as string)
  const type = db.leaveTypes.find((t) => t.id === input.leaveTypeId)
  const employee = db.employees.find((e) => e.id === l.employeeId)
  if (!type || !employee) throw new ServiceError('Leave type not found.')
  const steps = buildSteps(db, type.approvalChain, employee, actor.id)
  transact((d) =>
    withNotifications(
      touch(d, id, actor.id, 'Resubmitted with changes', { ...input, reason: input.reason.trim(), days: check.days, approvals: steps, status: 'pending' }),
      (steps[0]?.approverIds ?? []).map((a) => ({
        accountId: a,
        title: 'Leave request resubmitted',
        body: `${input.startDate} – ${input.endDate}`,
        link: `/leave/${id}`,
        kind: 'leave' as const,
      })),
    ),
  )
}

export function adjustBalance(actor: Account, employeeId: ID, leaveTypeId: ID, year: number, days: number, reason: string) {
  if (!can(actor, 'leave.manage')) throw new ServiceError('Only HR can adjust leave balances.', 'forbidden')
  if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 60) throw new ServiceError('Enter a non-zero adjustment of at most 60 days.')
  if (!reason.trim()) throw new ServiceError('Give a reason for the adjustment.')
  if (employeeId === actor.employeeId) throw new ServiceError('You cannot adjust your own balance.', 'forbidden')
  const adj = { id: createId('adj'), employeeId, leaveTypeId, year, days, reason: reason.trim(), by: actor.id, at: nowISO() }
  transact((d) =>
    withAudit(
      { ...d, leaveAdjustments: [...d.leaveAdjustments, adj] },
      actor.id,
      'leave.adjusted',
      { type: 'employee', id: employeeId },
      `${days > 0 ? '+' : ''}${days} day(s): ${adj.reason}`,
    ),
  )
}
