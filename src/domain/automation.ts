/**
 * Workflow rules — pure logic shared by the browser runner and the server scheduler.
 * A rule matches when its trigger equals the event type and every condition holds.
 */
import type { Database, ID, RuleAction, RuleCondition, TriggerType, WorkflowRule } from './types'

export const TRIGGERS: Array<{ value: TriggerType; label: string; description: string; scheduled?: boolean }> = [
  { value: 'employee.created', label: 'Employee created', description: 'A new employee record is added.' },
  { value: 'employee.joined', label: 'Employee joins', description: 'An employee’s joining date is reached.', scheduled: true },
  { value: 'employee.department_changed', label: 'Department changed', description: 'An employee moves to another department.' },
  { value: 'request.submitted', label: 'Request submitted', description: 'An employee submits a service request.' },
  { value: 'request.decided', label: 'Request approved or rejected', description: 'The approval chain of a request finishes.' },
  { value: 'leave.submitted', label: 'Leave requested', description: 'A leave request is submitted.' },
  { value: 'leave.decided', label: 'Leave approved or declined', description: 'A leave request is approved, declined or sent back.' },
  {
    value: 'task.overdue',
    label: 'Work becomes overdue',
    description: 'A request passes its service target or a checklist task passes its due date.',
    scheduled: true,
  },
  { value: 'document.expiring', label: 'Document approaching expiry', description: 'An employee document expires within 30 days.', scheduled: true },
  { value: 'onboarding.started', label: 'Onboarding begins', description: 'An onboarding checklist is started.' },
  { value: 'schedule.daily', label: 'Daily schedule', description: 'Runs once per day per rule.', scheduled: true },
]

export const CONDITION_FIELDS: Array<{ value: string; label: string; numeric?: boolean; triggers?: TriggerType[] }> = [
  { value: 'employee.department', label: 'Employee department (name)' },
  { value: 'employee.location', label: 'Employee location (name)' },
  { value: 'employee.employmentType', label: 'Employment type (name)' },
  { value: 'employee.status', label: 'Employee status' },
  { value: 'request.category', label: 'Request category', triggers: ['request.submitted', 'request.decided', 'task.overdue'] },
  { value: 'request.type', label: 'Request type (name)', triggers: ['request.submitted', 'request.decided'] },
  { value: 'priority', label: 'Request priority', triggers: ['request.submitted'] },
  { value: 'decision', label: 'Decision', triggers: ['request.decided', 'leave.decided'] },
  { value: 'leave.type', label: 'Leave type (name)', triggers: ['leave.submitted'] },
  { value: 'days', label: 'Leave days', numeric: true, triggers: ['leave.submitted', 'leave.decided'] },
  { value: 'entity.type', label: 'Overdue item type (request / lifecycle_task / task)', triggers: ['task.overdue'] },
  { value: 'daysOverdue', label: 'Days overdue', numeric: true, triggers: ['task.overdue'] },
  { value: 'document.kind', label: 'Document kind', triggers: ['document.expiring'] },
  { value: 'daysUntilExpiry', label: 'Days until expiry', numeric: true, triggers: ['document.expiring'] },
]

export const OPERATORS: Array<{ value: RuleCondition['operator']; label: string }> = [
  { value: 'equals', label: 'is' },
  { value: 'not_equals', label: 'is not' },
  { value: 'in', label: 'is one of (comma-separated)' },
  { value: 'contains', label: 'contains' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
]

export const ACTION_LABELS: Record<RuleAction['type'], string> = {
  create_task: 'Create and assign a task',
  notify: 'Send an in-app notification',
  send_email: 'Send an email (requires email provider)',
  request_approval: 'Request an approval (creates a request)',
  update_employee: 'Update an employee field',
  start_lifecycle: 'Start onboarding or offboarding',
}

export type EventContext = Record<string, string | number | null>

export function conditionHolds(c: RuleCondition, ctx: EventContext): boolean {
  const actual = ctx[c.field]
  if (actual === null || actual === undefined) return false
  const a = String(actual).toLowerCase()
  const e = c.value.trim().toLowerCase()
  switch (c.operator) {
    case 'equals':
      return a === e
    case 'not_equals':
      return a !== e
    case 'in':
      return e
        .split(',')
        .map((s) => s.trim())
        .includes(a)
    case 'contains':
      return a.includes(e)
    case 'gte':
      return Number(actual) >= Number(c.value)
    case 'lte':
      return Number(actual) <= Number(c.value)
  }
}

export function ruleMatches(rule: Pick<WorkflowRule, 'trigger' | 'conditions'>, trigger: TriggerType, ctx: EventContext): boolean {
  return rule.trigger === trigger && rule.conditions.every((c) => conditionHolds(c, ctx))
}

export function validateRule(
  rule: Pick<WorkflowRule, 'name' | 'trigger' | 'conditions' | 'actions' | 'maxAttempts'>,
  db: Pick<Database, 'requestTypes' | 'lifecycleTemplates' | 'accounts'>,
): string[] {
  const errors: string[] = []
  if (!rule.name.trim()) errors.push('Give the rule a name.')
  if (!TRIGGERS.some((t) => t.value === rule.trigger)) errors.push('Choose a trigger.')
  rule.conditions.forEach((c, i) => {
    const f = CONDITION_FIELDS.find((x) => x.value === c.field)
    if (!f) errors.push(`Condition ${i + 1}: choose a field.`)
    else if (f.triggers && !f.triggers.includes(rule.trigger)) errors.push(`Condition ${i + 1}: “${f.label}” is not available for this trigger.`)
    if (!c.value.trim()) errors.push(`Condition ${i + 1}: enter a value.`)
    if ((c.operator === 'gte' || c.operator === 'lte') && Number.isNaN(Number(c.value))) errors.push(`Condition ${i + 1}: enter a number.`)
  })
  if (!rule.actions.length) errors.push('Add at least one action.')
  rule.actions.forEach((a, i) => {
    const n = `Action ${i + 1}`
    if (a.type === 'create_task' && (!a.title.trim() || !(a.dueInDays >= 0 && a.dueInDays <= 90)))
      errors.push(`${n}: enter a title and a due date within 90 days.`)
    if ((a.type === 'notify' || a.type === 'send_email') && !(a.type === 'notify' ? a.message : a.body).trim()) errors.push(`${n}: enter a message.`)
    if (a.type === 'request_approval' && !db.requestTypes.some((t) => t.id === a.requestTypeId && t.approvalChain.length))
      errors.push(`${n}: choose a request type that has an approval chain.`)
    if (a.type === 'start_lifecycle' && a.templateId && !db.lifecycleTemplates.some((t) => t.id === a.templateId && t.kind === a.kind))
      errors.push(`${n}: choose a ${a.kind} template.`)
    if (a.type === 'update_employee' && a.field === 'status' && !['active', 'on_leave'].includes(a.value))
      errors.push(`${n}: automation may only set status to active or on leave.`)
    if ('to' in a && a.to.startsWith('account:') && !db.accounts.some((x) => `account:${x.id}` === a.to))
      errors.push(`${n}: the selected user no longer exists.`)
    if ('assignTo' in a && a.assignTo.startsWith('account:') && !db.accounts.some((x) => `account:${x.id}` === a.assignTo))
      errors.push(`${n}: the selected user no longer exists.`)
  })
  if (!(rule.maxAttempts >= 1 && rule.maxAttempts <= 5)) errors.push('Retries: allow between 1 and 5 attempts.')
  return errors
}

/** Replaces {placeholders} with event values; unknown placeholders are left visible. */
export function interpolate(template: string, ctx: EventContext): string {
  return template.replace(/\{(\w[\w.]*)\}/g, (m, key: string) => (ctx[key] !== undefined && ctx[key] !== null ? String(ctx[key]) : m))
}

/** Duplicate prevention: one execution per rule, trigger and entity (and calendar day for scheduled/date events). */
export function dedupeKey(ruleId: ID, trigger: TriggerType, entityId: string | null, day: string | null): string {
  return [ruleId, trigger, entityId ?? '-', day ?? ''].join(':')
}

export const PLACEHOLDERS = ['{employee}', '{department}', '{date}', '{subject}', '{document}', '{leave.type}', '{days}']
