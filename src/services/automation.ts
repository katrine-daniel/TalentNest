/**
 * Automation runner.
 *
 * Execution model (stated in the UI):
 * - Event rules run immediately after the change that triggered them, in the browser session of
 *   the person who made the change (demo) or by the `automation` Edge Function (Supabase).
 * - Scheduled rules (joins, overdue work, expiring documents, daily) run when `runScheduledChecks`
 *   is called: every 10 minutes while the app is open in demo mode, or by the server scheduler.
 * - Each rule runs at most once per trigger and record (dedupe key); failed runs are retried
 *   on the next scheduled pass until `maxAttempts`, and can be retried manually.
 */
import { addDays, daysBetween, today } from '@/lib/dates'
import { createId, fullName, nowISO } from '@/lib/utils'
import { dedupeKey, interpolate, ruleMatches, validateRule, type EventContext } from '@/domain/automation'
import { hrHandlers } from '@/domain/approvals'
import { buildSteps } from '@/domain/approvals'
import { can, type Permission } from '@/domain/permissions'
import { addBusinessHours } from '@/domain/sla'
import type { Account, AssigneeTarget, Database, Employee, HRRequest, ID, RuleAction, WorkflowRule, WorkflowRun } from '@/domain/types'
import { queueEvent, withAudit, withNotifications } from './activity'
import { applyEmployeePatch } from './employees'
import { events, type DomainEvent } from './events'
import { startLifecycle } from './lifecycle'
import { escalateOverdue } from './requests'
import { replaceById, ServiceError, store } from './store'
import { createTaskRecord } from './tasks'
import { transact } from './tx'

/** Whether an email provider is configured. In this build no client-side email sending exists. */
export const EMAIL_PROVIDER_CONFIGURED = false

export function buildContext(db: Database, event: Pick<DomainEvent, 'employeeId' | 'data'>): EventContext {
  const e = db.employees.find((x) => x.id === event.employeeId)
  return {
    employee: e ? fullName(e) : null,
    'employee.department': e ? (db.departments.find((d) => d.id === e.departmentId)?.name ?? null) : null,
    department: e ? (db.departments.find((d) => d.id === e.departmentId)?.name ?? null) : null,
    'employee.location': e ? (db.locations.find((l) => l.id === e.locationId)?.name ?? null) : null,
    'employee.employmentType': e ? (db.employmentTypes.find((t) => t.id === e.employmentTypeId)?.name ?? null) : null,
    'employee.status': e?.status ?? null,
    date: e?.joinDate ?? null,
    ...event.data,
  }
}

export function resolveTarget(db: Database, target: AssigneeTarget, employee: Employee | undefined): ID[] {
  const accountOf = (employeeId: ID | null | undefined) => db.accounts.find((a) => a.employeeId === employeeId && a.status === 'active')?.id
  if (target === 'employee') return [accountOf(employee?.id)].filter(Boolean) as ID[]
  if (target === 'manager') return [accountOf(employee?.managerId)].filter(Boolean) as ID[]
  if (target === 'department_head') return [accountOf(db.departments.find((d) => d.id === employee?.departmentId)?.headEmployeeId)].filter(Boolean) as ID[]
  if (target === 'hr_queue') return hrHandlers(db).map((a) => a.id)
  const id = target.slice('account:'.length)
  return db.accounts.some((a) => a.id === id && a.status === 'active') ? [id] : []
}

type Result = WorkflowRun['results'][number]

/** Applies one action to `db`. Pure with respect to the store; returns the next db and a result line. */
function applyAction(
  db: Database,
  rule: WorkflowRule,
  action: RuleAction,
  event: Pick<DomainEvent, 'employeeId' | 'data'>,
  ctx: EventContext,
  key: string,
): { db: Database; result: Result } {
  const employee = db.employees.find((e) => e.id === event.employeeId)
  switch (action.type) {
    case 'create_task': {
      const targets = resolveTarget(db, action.assignTo, employee)
      // HR-queue tasks stay unassigned so any HR handler can pick them up.
      const assignee = action.assignTo === 'hr_queue' ? null : (targets[0] ?? null)
      if (action.assignTo !== 'hr_queue' && !assignee)
        return { db, result: { action: action.type, outcome: 'failed', message: 'No one to assign the task to (target not found).' } }
      const { db: next, task } = createTaskRecord(db, {
        title: interpolate(action.title, ctx),
        description: `Created by automation “${rule.name}”.`,
        assigneeId: assignee,
        dueDate: addDays(today(), action.dueInDays),
        priority: action.priority,
        link: employee ? { type: 'employee', id: employee.id } : null,
        sourceKey: `${key}:task:${action.title}`,
        createdBy: null,
      })
      return {
        db: next,
        result: { action: action.type, outcome: 'done', message: task ? `Task “${task.title}” created` : 'Task already existed (not duplicated)' },
      }
    }
    case 'notify': {
      const targets = resolveTarget(db, action.to, employee)
      if (!targets.length) return { db, result: { action: action.type, outcome: 'failed', message: 'No recipient found.' } }
      const next = withNotifications(
        db,
        targets.map((accountId) => ({
          accountId,
          title: interpolate(action.title, ctx),
          body: interpolate(action.message, ctx),
          link: employee ? `/people/${employee.id}` : null,
          kind: 'automation' as const,
        })),
      )
      return { db: next, result: { action: action.type, outcome: 'done', message: `Notified ${targets.length} user(s)` } }
    }
    case 'send_email':
      return { db, result: { action: action.type, outcome: 'skipped', message: 'Not sent: no email provider is configured.' } }
    case 'request_approval': {
      const type = db.requestTypes.find((t) => t.id === action.requestTypeId)
      if (!type || !employee) return { db, result: { action: action.type, outcome: 'failed', message: 'Request type or employee not found.' } }
      const requester = hrHandlers(db)[0]
      if (!requester) return { db, result: { action: action.type, outcome: 'failed', message: 'No HR account available to raise the request.' } }
      const now = nowISO()
      const number = `HR-${db.requests.reduce((m, r) => Math.max(m, Number(r.number.replace(/\D/g, '')) || 0), 1000) + 1}`
      const request: HRRequest = {
        id: createId('req'),
        number,
        typeId: type.id,
        category: type.category,
        subject: interpolate(action.subject, ctx),
        description: `Raised by automation “${rule.name}”.`,
        requesterId: requester.id,
        employeeId: employee.id,
        priority: type.defaultPriority,
        status: 'pending_approval',
        assigneeId: null,
        dueAt: addBusinessHours(new Date(), type.slaHours).toISOString(),
        proposedChanges: null,
        approvals: buildSteps(db, type.approvalChain, employee, requester.id),
        comments: [],
        attachments: [],
        timeline: [{ id: createId('tl'), at: now, by: null, text: `Created by automation “${rule.name}”` }],
        resolution: null,
        escalatedAt: null,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      }
      return {
        db: { ...db, requests: [request, ...db.requests] },
        result: { action: action.type, outcome: 'done', message: `Approval request ${number} created` },
      }
    }
    case 'update_employee': {
      if (!employee) return { db, result: { action: action.type, outcome: 'failed', message: 'Employee not found.' } }
      return {
        db: applyEmployeePatch(db, employee.id, { [action.field]: action.value }, null, `Automation “${rule.name}”`),
        result: { action: action.type, outcome: 'done', message: `Set ${action.field} to ${action.value}` },
      }
    }
    case 'start_lifecycle':
      // Needs the live store (it validates against current data); handled by the caller.
      return { db, result: { action: action.type, outcome: 'done', message: 'deferred' } }
  }
}

/**
 * Actions that write records ordinary members may not change. They run only when the acting session (the
 * user whose change triggered the event, or the scheduler session) holds the permission; otherwise the run
 * fails and is retried by an HR session on the next scheduled check. This keeps the browser and the
 * database (row-level security) in agreement.
 */
const ACTION_PERMISSION: Partial<Record<RuleAction['type'], Permission>> = {
  request_approval: 'requests.handle',
  update_employee: 'people.manage',
  start_lifecycle: 'lifecycle.manage',
}

let sessionAccountId: ID | null = null
/** The signed-in account that scheduled checks and retries run as. */
export function setAutomationSession(accountId: ID | null) {
  sessionAccountId = accountId
}

function permissionGap(db: Database, event: Pick<DomainEvent, 'actorId'>, action: RuleAction): string | null {
  const needed = ACTION_PERMISSION[action.type]
  if (!needed) return null
  const acting = db.accounts.find((a) => a.id === (event.actorId ?? sessionAccountId))
  return acting && can(acting, needed) ? null : `Needs a session with the “${needed}” permission — retried on the next scheduled check run by HR.`
}

export interface ExecuteOptions {
  test?: boolean
  executor?: WorkflowRun['executor']
}

/** Runs one rule for one event and records the run. Returns the run (also in test mode). */
export function executeRule(rule: WorkflowRule, event: DomainEvent, opts: ExecuteOptions = {}, previousAttempts = 0): WorkflowRun {
  const db = store.db
  const ctx = buildContext(db, event)
  const day = event.type === 'schedule.daily' ? today() : null
  const key = dedupeKey(rule.id, event.type, String(event.data.key ?? event.entity?.id ?? event.employeeId ?? ''), day)
  let next = db
  const results: Result[] = []
  for (const action of rule.actions) {
    try {
      if (opts.test) {
        results.push({
          action: action.type,
          outcome: action.type === 'send_email' && !EMAIL_PROVIDER_CONFIGURED ? 'skipped' : 'done',
          message: describeAction(action, ctx, db),
        })
        continue
      }
      const gap = permissionGap(db, event, action)
      if (gap) {
        results.push({ action: action.type, outcome: 'failed', message: gap })
        continue
      }
      const out = applyAction(next, rule, action, event, ctx, key)
      next = out.db
      results.push(out.result)
    } catch (error) {
      results.push({ action: action.type, outcome: 'failed', message: error instanceof Error ? error.message : 'Action failed' })
    }
  }
  const failed = results.filter((r) => r.outcome === 'failed')
  const run: WorkflowRun = {
    id: createId('run'),
    ruleId: rule.id,
    ruleName: rule.name,
    trigger: event.type,
    entity: event.entity,
    dedupeKey: key,
    status: opts.test ? 'test' : failed.length ? 'failed' : 'succeeded',
    attempts: previousAttempts + 1,
    event: { employeeId: event.employeeId, data: event.data },
    results,
    error: failed.length ? failed.map((f) => f.message).join(' ') : null,
    executor: opts.executor ?? 'browser',
    at: nowISO(),
  }
  if (opts.test) return run
  store.commit(() => ({ ...next, runs: [run, ...next.runs].slice(0, 1000) }))
  // Lifecycle starts go through the service so its validation and events apply.
  for (const action of rule.actions) {
    if (action.type !== 'start_lifecycle' || !event.employeeId || permissionGap(store.db, event, action)) continue
    try {
      startLifecycle(null, action.kind, event.employeeId, action.templateId)
      patchRunResult(run.id, 'start_lifecycle', 'done', `${action.kind === 'onboarding' ? 'Onboarding' : 'Offboarding'} checklist started`)
    } catch (error) {
      patchRunResult(run.id, 'start_lifecycle', 'failed', error instanceof Error ? error.message : 'Could not start checklist')
    }
  }
  return store.db.runs.find((r) => r.id === run.id) ?? run
}

function patchRunResult(runId: ID, action: RuleAction['type'], outcome: Result['outcome'], message: string) {
  store.commit((d) => ({
    ...d,
    runs: replaceById(d.runs, runId, (r) => {
      const results = r.results.map((x) => (x.action === action && x.message === 'deferred' ? { ...x, outcome, message } : x))
      const failed = results.filter((x) => x.outcome === 'failed')
      return { ...r, results, status: failed.length ? 'failed' : 'succeeded', error: failed.length ? failed.map((f) => f.message).join(' ') : null }
    }),
  }))
}

export function describeAction(action: RuleAction, ctx: EventContext, db: Database): string {
  const who = (t: AssigneeTarget) =>
    t.startsWith('account:')
      ? (db.accounts.find((a) => `account:${a.id}` === t)?.name ?? 'unknown user')
      : { employee: 'the employee', manager: 'their manager', hr_queue: 'the HR queue', department_head: 'the department head' }[t as 'employee']
  switch (action.type) {
    case 'create_task':
      return `Create task “${interpolate(action.title, ctx)}” for ${who(action.assignTo)}, due in ${action.dueInDays} day(s)`
    case 'notify':
      return `Notify ${who(action.to)}: “${interpolate(action.message, ctx)}”`
    case 'send_email':
      return `Email ${who(action.to)}: “${interpolate(action.subject, ctx)}”${EMAIL_PROVIDER_CONFIGURED ? '' : ' — will be skipped: no email provider configured'}`
    case 'request_approval':
      return `Create approval request “${interpolate(action.subject, ctx)}” (${db.requestTypes.find((t) => t.id === action.requestTypeId)?.name ?? 'unknown type'})`
    case 'update_employee':
      return `Set employee ${action.field} to “${action.value}”`
    case 'start_lifecycle':
      return `Start ${action.kind} checklist (${action.templateId ? (db.lifecycleTemplates.find((t) => t.id === action.templateId)?.name ?? 'template') : 'best-matching template'})`
  }
}

function alreadyRan(db: Database, key: string): boolean {
  return db.runs.some((r) => r.dedupeKey === key && r.status === 'succeeded')
}

export function handleEvent(event: DomainEvent, executor: WorkflowRun['executor'] = 'browser') {
  const db = store.db
  const ctx = buildContext(db, event)
  for (const rule of db.rules) {
    if (!rule.enabled || !ruleMatches(rule, event.type, ctx)) continue
    const key = dedupeKey(
      rule.id,
      event.type,
      String(event.data.key ?? event.entity?.id ?? event.employeeId ?? ''),
      event.type === 'schedule.daily' ? today() : null,
    )
    const prior = store.db.runs.filter((r) => r.dedupeKey === key)
    if (alreadyRan(store.db, key) || prior.some((r) => r.status === 'failed' && r.attempts >= rule.maxAttempts)) continue
    if (prior.some((r) => r.status === 'failed')) continue // retried by the scheduler, not on repeat events
    executeRule(rule, event, { executor })
  }
  // Actions such as starting onboarding may queue further events.
  events.flush()
}

/** Dry run of a rule against an event built from a real record. Changes nothing. */
export function previewRule(rule: WorkflowRule, event: DomainEvent) {
  const db = store.db
  const ctx = buildContext(db, event)
  const errors = validateRule(rule, db)
  const matches = ruleMatches(rule, event.type, ctx)
  return {
    errors,
    matches,
    context: ctx,
    run: matches && !errors.length ? executeRule(rule, event, { test: true }) : null,
    failing: rule.conditions.filter((c) => !ruleMatches({ trigger: rule.trigger, conditions: [c] }, event.type, ctx)),
  }
}

export function retryRun(actor: Account | null, runId: ID) {
  if (actor && !can(actor, 'automation.manage')) throw new ServiceError('Only automation managers can retry runs.', 'forbidden')
  const run = store.db.runs.find((r) => r.id === runId)
  const rule = run && store.db.rules.find((r) => r.id === run.ruleId)
  if (!run || !rule || run.status !== 'failed' || !run.event) throw new ServiceError('Only failed runs with a recorded event can be retried.', 'conflict')
  return executeRule(
    rule,
    { type: run.trigger, entity: run.entity, employeeId: run.event.employeeId, actorId: actor?.id ?? null, data: run.event.data },
    { executor: 'browser' },
    run.attempts,
  )
}

/** Scheduled pass: joins, overdue work, expiring documents, daily rules and automatic retries. */
export function runScheduledChecks(now = new Date()): { events: number; retries: number } {
  const db = store.db
  const T = today(now)
  let count = 0
  // Employees whose joining date has arrived become active.
  for (const e of db.employees.filter((x) => x.status === 'pre_boarding' && x.joinDate <= T)) {
    store.commit((d) =>
      withAudit(
        applyEmployeePatch(d, e.id, { status: 'active' }, null, 'Joining date reached'),
        null,
        'employee.joined',
        { type: 'employee', id: e.id },
        `${fullName(e)} joined`,
      ),
    )
    queueEvent({ type: 'employee.joined', entity: { type: 'employee', id: e.id }, employeeId: e.id, actorId: null, data: { date: e.joinDate } })
    count++
  }
  // People whose last working day has passed become former employees and lose sign-in.
  for (const e of store.db.employees.filter((x) => x.status === 'offboarding' && x.endDate && x.endDate < T)) {
    store.commit((d) =>
      withAudit(
        {
          ...applyEmployeePatch(d, e.id, { status: 'terminated' }, null, 'Last working day passed'),
          accounts: d.accounts.map((a) => (a.employeeId === e.id ? { ...a, status: 'suspended' as const } : a)),
        },
        null,
        'employee.left',
        { type: 'employee', id: e.id },
        `${fullName(e)} left (last day ${e.endDate})`,
      ),
    )
    count++
  }
  count += escalateOverdue(now.getTime()).length
  for (const c of store.db.lifecycleCases.filter((x) => x.status === 'active')) {
    for (const t of c.tasks.filter((x) => x.status === 'open' && x.dueDate < T)) {
      queueEvent({
        type: 'task.overdue',
        entity: { type: 'lifecycle', id: c.id },
        employeeId: c.employeeId,
        actorId: null,
        data: { key: t.id, 'entity.type': 'lifecycle_task', subject: t.title, daysOverdue: daysBetween(t.dueDate, T) },
      })
      count++
    }
  }
  for (const t of store.db.tasks.filter((x) => x.status === 'open' && x.dueDate && x.dueDate < T)) {
    queueEvent({
      type: 'task.overdue',
      entity: t.link,
      employeeId: t.link?.type === 'employee' ? t.link.id : null,
      actorId: null,
      data: { key: t.id, 'entity.type': 'task', subject: t.title, daysOverdue: daysBetween(t.dueDate as string, T) },
    })
    count++
  }
  for (const e of store.db.employees.filter((x) => x.status !== 'terminated')) {
    for (const doc of e.documents.filter((d) => d.expiresOn && d.expiresOn >= T && daysBetween(T, d.expiresOn) <= 30)) {
      queueEvent({
        type: 'document.expiring',
        entity: { type: 'employee', id: e.id },
        employeeId: e.id,
        actorId: null,
        data: {
          key: doc.id,
          document: doc.name.replace(/\.\w+$/, ''),
          'document.kind': doc.kind,
          date: doc.expiresOn,
          daysUntilExpiry: daysBetween(T, doc.expiresOn as string),
        },
      })
      count++
    }
  }
  queueEvent({ type: 'schedule.daily', entity: null, employeeId: null, actorId: null, data: { key: T } })
  events.flush()
  // Automatic retries for failed runs below their attempt limit.
  let retries = 0
  for (const run of store.db.runs.filter((r) => r.status === 'failed')) {
    const rule = store.db.rules.find((r) => r.id === run.ruleId)
    const latest = store.db.runs.find((r) => r.dedupeKey === run.dedupeKey)
    if (!rule?.enabled || latest?.id !== run.id || run.attempts >= rule.maxAttempts) continue
    retryRun(null, run.id)
    retries++
  }
  return { events: count, retries }
}

// ------------------------------------------------------------------ rule management
export type RuleInput = Pick<WorkflowRule, 'name' | 'description' | 'trigger' | 'conditions' | 'actions' | 'enabled' | 'maxAttempts'>

export function saveRule(actor: Account, input: RuleInput, id?: ID): WorkflowRule {
  if (!can(actor, 'automation.manage')) throw new ServiceError('Only automation managers can change rules.', 'forbidden')
  const errors = validateRule(input, store.db)
  if (errors.length) throw new ServiceError(errors.join(' '))
  const now = nowISO()
  const existing = id ? store.db.rules.find((r) => r.id === id) : undefined
  if (id && !existing) throw new ServiceError('Rule not found.', 'not_found')
  const rule: WorkflowRule = existing
    ? {
        ...existing,
        ...input,
        name: input.name.trim(),
        updatedAt: now,
        changeLog: [...existing.changeLog, { id: createId('chg'), at: now, by: actor.id, text: summarizeChange(existing, input) }],
      }
    : {
        ...input,
        name: input.name.trim(),
        id: createId('rule'),
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
        changeLog: [{ id: createId('chg'), at: now, by: actor.id, text: 'Rule created' }],
      }
  transact((d) =>
    withAudit(
      { ...d, rules: existing ? replaceById(d.rules, rule.id, () => rule) : [...d.rules, rule] },
      actor.id,
      existing ? 'rule.updated' : 'rule.created',
      { type: 'rule', id: rule.id },
      rule.name,
    ),
  )
  return rule
}

function summarizeChange(before: WorkflowRule, after: RuleInput): string {
  const parts: string[] = []
  if (before.name !== after.name) parts.push('renamed')
  if (before.trigger !== after.trigger) parts.push('trigger changed')
  if (JSON.stringify(before.conditions) !== JSON.stringify(after.conditions)) parts.push('conditions changed')
  if (JSON.stringify(before.actions) !== JSON.stringify(after.actions)) parts.push('actions changed')
  if (before.enabled !== after.enabled) parts.push(after.enabled ? 'enabled' : 'disabled')
  if (before.maxAttempts !== after.maxAttempts) parts.push(`retries set to ${after.maxAttempts}`)
  return parts.length ? `Edited: ${parts.join(', ')}` : 'Saved without changes'
}

export function setRuleEnabled(actor: Account, id: ID, enabled: boolean) {
  const rule = store.db.rules.find((r) => r.id === id)
  if (!rule) throw new ServiceError('Rule not found.', 'not_found')
  saveRule(actor, { ...rule, enabled }, id)
}

export function deleteRule(actor: Account, id: ID) {
  if (!can(actor, 'automation.manage')) throw new ServiceError('Only automation managers can delete rules.', 'forbidden')
  const rule = store.db.rules.find((r) => r.id === id)
  if (!rule) throw new ServiceError('Rule not found.', 'not_found')
  transact((d) =>
    withAudit({ ...d, rules: d.rules.filter((r) => r.id !== id) }, actor.id, 'rule.deleted', { type: 'rule', id }, `${rule.name} deleted (run history kept)`),
  )
}

let installed = false
let timer: ReturnType<typeof setInterval> | null = null
/** Connects the runner to domain events and starts the in-browser scheduler (demo mode). */
export function installAutomation({ scheduleInBrowser }: { scheduleInBrowser: boolean }) {
  if (!installed) {
    installed = true
    events.subscribe((e) => {
      if (store.getState().db) handleEvent(e)
    })
  }
  if (scheduleInBrowser && !timer) {
    const tick = () => {
      if (store.getState().status === 'ready') runScheduledChecks()
    }
    tick()
    timer = setInterval(tick, 10 * 60_000)
  }
}

export function stopScheduler() {
  if (timer) clearInterval(timer)
  timer = null
}
