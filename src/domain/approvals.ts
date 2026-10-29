/**
 * Approval chains shared by service requests and leave.
 *
 * Rules:
 * - Steps are decided in order; only the first pending step is active.
 * - Approvers are resolved from the chain rule: the employee's manager, their department head,
 *   any HR handler, or a specific account.
 * - Nobody may decide a step on a request about themselves or that they raised (no self-approval).
 *   If that leaves a step with no eligible approver, it falls back to HR handlers.
 * - Reject ends the chain. Request changes returns it to the requester; resubmitting restarts the chain.
 * - A step may be delegated once to another eligible account; the delegate decides instead.
 */
import { createId } from '@/lib/utils'
import { can } from './permissions'
import type { Account, ApprovalStage, ApprovalStep, Database, Employee, ID } from './types'

type Ctx = Pick<Database, 'accounts' | 'employees' | 'departments'>

function accountForEmployee(db: Ctx, employeeId: ID | null | undefined): Account | undefined {
  return employeeId ? db.accounts.find((a) => a.employeeId === employeeId && a.status === 'active') : undefined
}

export function hrHandlers(db: Pick<Database, 'accounts'>): Account[] {
  return db.accounts.filter((a) => a.status === 'active' && can(a, 'requests.handle'))
}

export function resolveApprovers(db: Ctx, stage: ApprovalStage, subject: Employee, requesterId: ID): ID[] {
  const exclude = new Set([requesterId, accountForEmployee(db, subject.id)?.id].filter(Boolean) as ID[])
  let ids: ID[] = []
  if (stage.rule === 'manager') ids = [accountForEmployee(db, subject.managerId)?.id].filter(Boolean) as ID[]
  if (stage.rule === 'department_head') {
    const head = db.departments.find((d) => d.id === subject.departmentId)?.headEmployeeId
    ids = [accountForEmployee(db, head)?.id].filter(Boolean) as ID[]
  }
  if (stage.rule === 'specific' && stage.accountId) ids = [stage.accountId]
  if (stage.rule === 'hr') ids = hrHandlers(db).map((a) => a.id)
  ids = ids.filter((id) => !exclude.has(id))
  // Fallback: HR handlers who are not involved.
  if (!ids.length) ids = hrHandlers(db).map((a) => a.id).filter((id) => !exclude.has(id))
  return ids
}

export function buildSteps(db: Ctx, chain: readonly ApprovalStage[], subject: Employee, requesterId: ID): ApprovalStep[] {
  return chain.map((stage) => ({
    id: createId('apr'),
    stageName: stage.name,
    rule: stage.rule,
    approverIds: resolveApprovers(db, stage, subject, requesterId),
    delegatedTo: null,
    decision: 'pending',
    decidedBy: null,
    decidedAt: null,
    comment: '',
  }))
}

export function activeStep(steps: readonly ApprovalStep[]): ApprovalStep | undefined {
  return steps.find((s) => s.decision === 'pending')
}

export function canDecide(steps: readonly ApprovalStep[], accountId: ID): boolean {
  const step = activeStep(steps)
  if (!step) return false
  return step.delegatedTo ? step.delegatedTo === accountId : step.approverIds.includes(accountId)
}

export type Decision = 'approved' | 'rejected' | 'changes_requested'

export interface DecisionResult {
  steps: ApprovalStep[]
  /** Overall outcome once the chain is finished, or `pending` while steps remain. */
  outcome: 'pending' | Decision
}

export function decide(steps: readonly ApprovalStep[], accountId: ID, decision: Decision, comment: string, at: string): DecisionResult {
  const step = activeStep(steps)
  if (!step) throw new Error('This request has no pending approval step.')
  if (!canDecide(steps, accountId)) throw new Error('You are not an approver for the current step.')
  if (decision !== 'approved' && !comment.trim()) throw new Error('Add a comment explaining the decision.')
  const next = steps.map((s) => (s.id === step.id ? { ...s, decision, decidedBy: accountId, decidedAt: at, comment: comment.trim() } : s))
  if (decision !== 'approved') return { steps: next, outcome: decision }
  return { steps: next, outcome: activeStep(next) ? 'pending' : 'approved' }
}

export function delegate(steps: readonly ApprovalStep[], accountId: ID, toAccountId: ID, eligible: readonly ID[]): ApprovalStep[] {
  const step = activeStep(steps)
  if (!step || !canDecide(steps, accountId)) throw new Error('You cannot delegate this step.')
  if (step.delegatedTo) throw new Error('This step has already been delegated.')
  if (!eligible.includes(toAccountId) || toAccountId === accountId) throw new Error('Choose another eligible approver.')
  return steps.map((s) => (s.id === step.id ? { ...s, delegatedTo: toAccountId } : s))
}

/** Restarts a chain after the requester resubmits following "changes requested". */
export function restartSteps(db: Ctx, chain: readonly ApprovalStage[], subject: Employee, requesterId: ID): ApprovalStep[] {
  return buildSteps(db, chain, subject, requesterId)
}

export function describeApprover(step: ApprovalStep, accounts: readonly Account[]): string {
  const ids = step.delegatedTo ? [step.delegatedTo] : step.approverIds
  const names = ids.map((id) => accounts.find((a) => a.id === id)?.name).filter(Boolean) as string[]
  if (step.rule === 'hr' && !step.delegatedTo) return 'HR team'
  return names.length ? names.join(', ') : 'No eligible approver'
}
