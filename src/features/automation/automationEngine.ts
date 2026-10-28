/**
 * Pure automation logic: validation, condition matching and action planning.
 * No side effects here — automationService applies the planned actions.
 */
import type { AutomationAction, AutomationCondition, AutomationRule, AutomationTrigger, Database } from '@/types/domain'
import type { DomainEvent } from '@/services/events/eventBus'

export const TRIGGERS: Array<{ value: AutomationTrigger; label: string; description: string }> = [
  { value: 'application.created', label: 'Application created', description: 'A candidate applies or is added to a vacancy.' },
  { value: 'stage.changed', label: 'Stage changed', description: 'An application moves to another stage.' },
  { value: 'interview.completed', label: 'Interview feedback completed', description: 'Every panelist has submitted a scorecard.' },
  { value: 'offer.accepted', label: 'Offer accepted', description: 'An offer is marked as accepted.' },
  { value: 'feedback.overdue', label: 'Feedback overdue (scheduled)', description: 'Checked on a schedule: a completed interview still lacks scorecards.' },
]

export const CONDITION_FIELDS: Array<{ value: string; label: string; numeric?: boolean; triggers?: AutomationTrigger[] }> = [
  { value: 'job.departmentId', label: 'Vacancy department (id)' },
  { value: 'job.title', label: 'Vacancy title' },
  { value: 'stage.type', label: 'Stage type', triggers: ['stage.changed', 'application.created'] },
  { value: 'stage.name', label: 'Stage name', triggers: ['stage.changed', 'application.created'] },
  { value: 'candidate.source', label: 'Candidate source' },
  { value: 'candidate.experienceYears', label: 'Candidate experience (years)', numeric: true },
  { value: 'hoursOverdue', label: 'Hours overdue', numeric: true, triggers: ['feedback.overdue'] },
]

export const OPERATORS: Array<{ value: AutomationCondition['operator']; label: string; numeric?: boolean }> = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'gte', label: '≥', numeric: true },
  { value: 'lte', label: '≤', numeric: true },
]

export type EventContext = Record<string, string | number | null>

/** Flattens the records referenced by an event into the fields conditions can test. */
export function buildEventContext(event: DomainEvent, data: Pick<Database, 'jobs' | 'candidates' | 'applications'>): EventContext {
  const { context } = event
  const app = context.applicationId ? data.applications.find((a) => a.id === context.applicationId) : undefined
  const job = data.jobs.find((j) => j.id === (context.jobId ?? app?.jobId))
  const candidate = data.candidates.find((c) => c.id === (context.candidateId ?? app?.candidateId))
  const stage = job?.stages.find((s) => s.id === (context.stageId ?? app?.stageId))
  return {
    'job.departmentId': job?.departmentId ?? null,
    'job.title': job?.title ?? null,
    'job.recruiterId': job?.recruiterId ?? null,
    'job.hiringManagerId': job?.hiringManagerId ?? null,
    'stage.type': stage?.type ?? null,
    'stage.name': stage?.name ?? null,
    'candidate.source': candidate?.source ?? null,
    'candidate.experienceYears': candidate?.experienceYears ?? null,
    'candidate.name': candidate ? `${candidate.firstName} ${candidate.lastName}` : null,
    hoursOverdue: context.hoursOverdue ?? null,
  }
}

export function conditionMatches(condition: AutomationCondition, ctx: EventContext): boolean {
  const actual = ctx[condition.field]
  if (actual === null || actual === undefined) return false
  const expected = condition.value.trim()
  switch (condition.operator) {
    case 'equals':
      return String(actual).toLowerCase() === expected.toLowerCase()
    case 'not_equals':
      return String(actual).toLowerCase() !== expected.toLowerCase()
    case 'contains':
      return String(actual).toLowerCase().includes(expected.toLowerCase())
    case 'gte':
      return Number(actual) >= Number(expected)
    case 'lte':
      return Number(actual) <= Number(expected)
    default:
      return false
  }
}

export function ruleMatches(rule: AutomationRule, event: DomainEvent, ctx: EventContext) {
  if (!rule.enabled || rule.trigger !== event.type) return false
  return rule.conditions.every((c) => conditionMatches(c, ctx))
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateRule(
  rule: Pick<AutomationRule, 'name' | 'trigger' | 'conditions' | 'actions'>,
  data: Pick<Database, 'users' | 'onboardingTemplates'>,
): ValidationResult {
  const errors: string[] = []
  if (!rule.name.trim()) errors.push('Give the rule a name.')
  if (!TRIGGERS.some((t) => t.value === rule.trigger)) errors.push('Choose a valid trigger.')
  rule.conditions.forEach((c, i) => {
    const field = CONDITION_FIELDS.find((f) => f.value === c.field)
    if (!field) errors.push(`Condition ${i + 1}: unknown field.`)
    else if (field.triggers && !field.triggers.includes(rule.trigger)) errors.push(`Condition ${i + 1}: “${field.label}” is not available for this trigger.`)
    if (!c.value.trim()) errors.push(`Condition ${i + 1}: enter a value.`)
    const op = OPERATORS.find((o) => o.value === c.operator)
    if (op?.numeric && Number.isNaN(Number(c.value))) errors.push(`Condition ${i + 1}: “${op.label}” needs a number.`)
  })
  if (!rule.actions.length) errors.push('Add at least one action.')
  rule.actions.forEach((a, i) => {
    const n = i + 1
    if (a.type === 'create_task') {
      if (!a.title.trim()) errors.push(`Action ${n}: task title is required.`)
      if (!(a.dueInDays >= 0 && a.dueInDays <= 60)) errors.push(`Action ${n}: due date must be 0–60 days out.`)
    }
    if (a.type === 'notify' && !a.message.trim()) errors.push(`Action ${n}: notification message is required.`)
    if (a.type === 'assign_recruiter' && !data.users.some((u) => u.id === a.userId && (u.role === 'Recruiter' || u.role === 'Admin') && u.status === 'active'))
      errors.push(`Action ${n}: choose an active recruiter.`)
    if (a.type === 'create_onboarding_plan' && !data.onboardingTemplates.some((t) => t.id === a.templateId))
      errors.push(`Action ${n}: choose an onboarding template.`)
    if (a.type === 'create_onboarding_plan' && rule.trigger !== 'offer.accepted')
      errors.push(`Action ${n}: onboarding plans can only start from “Offer accepted”.`)
  })
  return { valid: errors.length === 0, errors }
}

/** Replaces {candidate}, {job} and {stage} placeholders. */
export function interpolate(template: string, ctx: EventContext) {
  return template
    .replace(/\{candidate\}/g, String(ctx['candidate.name'] ?? 'the candidate'))
    .replace(/\{job\}/g, String(ctx['job.title'] ?? 'the vacancy'))
    .replace(/\{stage\}/g, String(ctx['stage.name'] ?? 'the stage'))
}

/** Resolves 'recruiter' / 'hiring_manager' targets to user ids for this event. */
export function resolveUser(target: string, ctx: EventContext): string | null {
  if (target === 'recruiter') return (ctx['job.recruiterId'] as string) ?? null
  if (target === 'hiring_manager') return (ctx['job.hiringManagerId'] as string) ?? null
  return target || null
}

export function describeAction(action: AutomationAction, ctx: EventContext, userName: (id: string | null) => string): string {
  switch (action.type) {
    case 'create_task':
      return `Create task “${interpolate(action.title, ctx)}” for ${userName(resolveUser(action.assignTo, ctx))}, due in ${action.dueInDays} day(s)`
    case 'notify':
      return `Notify ${userName(resolveUser(action.userId, ctx))}: “${interpolate(action.message, ctx)}”`
    case 'assign_recruiter':
      return `Assign candidate to ${userName(action.userId)}`
    case 'create_onboarding_plan':
      return 'Start the onboarding checklist'
  }
}

/** Key used to make sure the same rule never acts twice on the same record. */
export const dedupeKey = (ruleId: string, event: DomainEvent) =>
  `${ruleId}:${event.type}:${event.entityId}${event.type === 'stage.changed' ? `@${event.context.stageId ?? ''}` : ''}`
