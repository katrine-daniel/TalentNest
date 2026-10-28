/**
 * Executes automation rules against domain events.
 *
 * Event-driven rules run in this app immediately after the triggering action.
 * The scheduled "feedback overdue" check runs when `runScheduledChecks` is called
 * (Automation page, or the Supabase scheduled function in supabase/functions).
 * Nothing here claims to run while no one has the app open.
 */
import { dataStore } from '@/services/storage/dataStore'
import { eventBus, type DomainEvent } from '@/services/events/eventBus'
import { createId } from '@/utils/ids'
import type { AutomationAction, AutomationRule, AutomationRun, Database } from '@/types/domain'
import { buildEventContext, dedupeKey, describeAction, interpolate, resolveUser, ruleMatches, validateRule, type EventContext } from './automationEngine'
import { createOnboardingPlan } from '@/features/onboarding/onboardingPlanFactory'
import { feedbackCompletion } from '@/features/interviews/feedbackSelectors'

const DAY = 86_400_000
const MAX_RUNS = 300

function snapshot(): Database {
  const snap = dataStore.getSnapshot()
  if (!snap.data) throw new Error('Data not loaded')
  return snap.data
}

function userName(data: Database) {
  return (id: string | null) => data.users.find((u) => u.id === id)?.name ?? 'unassigned'
}

function logRun(run: Omit<AutomationRun, 'id' | 'at'>) {
  dataStore.write('automationRuns', (list) => [{ ...run, id: createId('run'), at: new Date().toISOString() }, ...list].slice(0, MAX_RUNS))
}

/** Applies one action; returns a human-readable description of what happened. */
function applyAction(action: AutomationAction, rule: AutomationRule, event: DomainEvent, ctx: EventContext, key: string, data: Database): string {
  const now = new Date()
  switch (action.type) {
    case 'create_task': {
      const assigneeId = resolveUser(action.assignTo, ctx)
      dataStore.write('tasks', (list) => [
        {
          id: createId('task'),
          title: interpolate(action.title, ctx),
          assigneeId,
          dueDate: new Date(now.getTime() + action.dueInDays * DAY).toISOString(),
          status: 'open',
          candidateId: event.context.candidateId ?? null,
          applicationId: event.context.applicationId ?? null,
          createdById: null,
          createdAt: now.toISOString(),
          completedAt: null,
          sourceKey: key,
        },
        ...list,
      ])
      return describeAction(action, ctx, userName(data))
    }
    case 'notify': {
      const userId = resolveUser(action.userId, ctx)
      dataStore.write('notifications', (list) => [
        {
          id: createId('ntf'),
          type: 'automation',
          title: rule.name,
          body: interpolate(action.message, ctx),
          at: now.toISOString(),
          read: false,
          userId,
          link: event.context.candidateId ? `/candidates/${event.context.candidateId}` : undefined,
        },
        ...list,
      ])
      return describeAction(action, ctx, userName(data))
    }
    case 'assign_recruiter': {
      if (!event.context.candidateId) return 'Skipped: no candidate on this event'
      dataStore.write('candidates', (list) => list.map((c) => (c.id === event.context.candidateId ? { ...c, recruiterId: action.userId } : c)))
      return describeAction(action, ctx, userName(data))
    }
    case 'create_onboarding_plan': {
      const offer = data.offers.find((o) => o.id === event.context.offerId)
      const job = data.jobs.find((j) => j.id === offer?.jobId)
      const template = data.onboardingTemplates.find((t) => t.id === action.templateId)
      if (!offer || !job || !template) return 'Skipped: offer, vacancy or template not found'
      if (data.onboardingPlans.some((p) => p.offerId === offer.id)) return 'Skipped: onboarding plan already exists'
      dataStore.write('onboardingPlans', (list) => [createOnboardingPlan({ template, offer, job, users: data.users }), ...list])
      return 'Started onboarding checklist'
    }
  }
}

/** Handles one domain event: runs every enabled, matching rule once per record. */
export function handleEvent(event: DomainEvent) {
  const data = snapshot()
  const ctx = buildEventContext(event, data)
  for (const rule of data.automationRules) {
    if (!ruleMatches(rule, event, ctx)) continue
    const key = dedupeKey(rule.id, event)
    const already = snapshot().automationRuns.some((r) => r.ruleId === rule.id && r.status === 'success' && r.detail === key)
    if (already) {
      logRun({
        ruleId: rule.id,
        ruleName: rule.name,
        trigger: event.type,
        entityId: event.entityId,
        status: 'skipped',
        detail: `Already ran for this record (${key})`,
        actions: [],
      })
      continue
    }
    const validation = validateRule(rule, data)
    if (!validation.valid) {
      logRun({
        ruleId: rule.id,
        ruleName: rule.name,
        trigger: event.type,
        entityId: event.entityId,
        status: 'failed',
        detail: validation.errors.join(' '),
        actions: [],
      })
      continue
    }
    try {
      const done = rule.actions.map((a) => applyAction(a, rule, event, ctx, key, snapshot()))
      logRun({ ruleId: rule.id, ruleName: rule.name, trigger: event.type, entityId: event.entityId, status: 'success', detail: key, actions: done })
    } catch (error) {
      logRun({
        ruleId: rule.id,
        ruleName: rule.name,
        trigger: event.type,
        entityId: event.entityId,
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
        actions: [],
      })
    }
  }
}

/** Preview: which rules would match an event and what they would do — without changing anything. */
export function previewRule(rule: AutomationRule, event: DomainEvent, data: Database = snapshot()) {
  const ctx = buildEventContext(event, data)
  const validation = validateRule(rule, data)
  const matches = ruleMatches({ ...rule, enabled: true }, event, ctx)
  const failing = rule.conditions.filter((c) => !ruleMatches({ ...rule, enabled: true, conditions: [c] }, event, ctx))
  return {
    validation,
    matches,
    failingConditions: failing,
    context: ctx,
    actions: matches ? rule.actions.map((a) => describeAction(a, ctx, userName(data))) : [],
  }
}

/** Builds "feedback overdue" events for completed interviews still missing scorecards. */
export function overdueFeedbackEvents(data: Database, now = Date.now()): DomainEvent[] {
  return data.interviews
    .filter((i) => i.status === 'completed')
    .map((i) => ({ i, completion: feedbackCompletion(i, data.interviewFeedback) }))
    .filter(({ completion }) => !completion.complete)
    .map(({ i }) => ({
      type: 'feedback.overdue' as const,
      entityId: i.id,
      actorId: null,
      context: {
        interviewId: i.id,
        applicationId: i.applicationId,
        candidateId: i.candidateId,
        jobId: i.jobId,
        stageId: i.stageId,
        hoursOverdue: Math.max(0, Math.floor((now - new Date(i.start).getTime()) / 3_600_000)),
      },
    }))
}

export function runScheduledChecks() {
  const events = overdueFeedbackEvents(snapshot())
  events.forEach(handleEvent)
  return events.length
}

let installed = false
/** Connects the engine to the event bus once per app session. */
export function installAutomation() {
  if (installed) return
  installed = true
  eventBus.subscribe(handleEvent)
}
