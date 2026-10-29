/**
 * Onboarding and offboarding cases built from reusable templates.
 *
 * External actions (create accounts, revoke access, final pay) are checklist items: completing
 * one records that a person confirmed it was done in the external system. PeopleOS does not
 * perform those actions unless an integration is configured.
 */
import { addDays, isValidISODate, today } from '@/lib/dates'
import { createId, nowISO } from '@/lib/utils'
import { can } from '@/domain/permissions'
import type { Account, Database, Employee, ID, LifecycleCase, LifecycleKind, LifecycleTemplate, TaskOwner } from '@/domain/types'
import { queueEvent, withAudit, withNotifications } from './activity'
import { applyEmployeePatch } from './employees'
import { files } from './files'
import { replaceById, ServiceError, store } from './store'
import { transact } from './tx'

export const OWNER_LABELS: Record<TaskOwner, string> = {
  hr: 'HR',
  manager: 'Manager',
  it: 'IT',
  employee: 'Employee',
  facilities: 'Facilities',
  finance: 'Finance',
}

/** Most specific matching active template: each matching filter scores a point; mismatches exclude it. */
export function suggestTemplate(
  templates: readonly LifecycleTemplate[],
  kind: LifecycleKind,
  e: Pick<Employee, 'departmentId' | 'locationId' | 'employmentTypeId'>,
): LifecycleTemplate | undefined {
  const score = (t: LifecycleTemplate) => {
    const filters: Array<[ID | null, ID]> = [
      [t.departmentId, e.departmentId],
      [t.locationId, e.locationId],
      [t.employmentTypeId, e.employmentTypeId],
    ]
    if (filters.some(([f, v]) => f !== null && f !== v)) return -1
    return filters.filter(([f]) => f !== null).length
  }
  return templates
    .filter((t) => t.kind === kind && t.active)
    .map((t) => ({ t, s: score(t) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)[0]?.t
}

/** Default assignee per owner type. HR tasks are left for the HR queue (any HR handler may complete them). */
export function defaultAssignee(db: Database, owner: TaskOwner, e: Employee): ID | null {
  const account = (employeeId: ID | null | undefined) => db.accounts.find((a) => a.employeeId === employeeId && a.status === 'active')?.id ?? null
  if (owner === 'manager') return account(e.managerId)
  if (owner === 'employee') return account(e.id)
  if (owner === 'it') return account(db.departments.find((d) => /tech|it/i.test(d.name))?.headEmployeeId)
  if (owner === 'finance') return account(db.departments.find((d) => /financ/i.test(d.name))?.headEmployeeId)
  return null
}

export function canManageTask(actor: Account, task: LifecycleCase['tasks'][number]): boolean {
  return can(actor, 'lifecycle.manage') || task.assigneeId === actor.id
}

/** Cases visible to the account: HR sees all; others see cases they have tasks in or that concern their reports. */
export function visibleCases(db: Database, actor: Account): LifecycleCase[] {
  if (can(actor, 'lifecycle.manage')) return db.lifecycleCases
  return db.lifecycleCases.filter(
    (c) =>
      c.employeeId === actor.employeeId ||
      c.tasks.some((t) => t.assigneeId === actor.id) ||
      db.employees.find((e) => e.id === c.employeeId)?.managerId === actor.employeeId,
  )
}

export function startLifecycle(actorOrSystem: Account | null, kind: LifecycleKind, employeeId: ID, templateId: ID | null, keyDate?: string): LifecycleCase {
  if (actorOrSystem && !can(actorOrSystem, 'lifecycle.manage')) throw new ServiceError('Only HR can start onboarding or offboarding.', 'forbidden')
  const db = store.db
  const employee = db.employees.find((e) => e.id === employeeId)
  if (!employee) throw new ServiceError('Employee not found.', 'not_found')
  if (db.lifecycleCases.some((c) => c.employeeId === employeeId && c.kind === kind && c.status === 'active'))
    throw new ServiceError(`${employee.firstName} already has an active ${kind} checklist.`, 'conflict')
  const template = templateId
    ? db.lifecycleTemplates.find((t) => t.id === templateId && t.kind === kind)
    : suggestTemplate(db.lifecycleTemplates, kind, employee)
  if (!template) throw new ServiceError(`No active ${kind} template matches this employee. Create one in Organization → Templates.`)
  const date = keyDate ?? (kind === 'onboarding' ? employee.joinDate : employee.endDate)
  if (!date || !isValidISODate(date))
    throw new ServiceError(kind === 'offboarding' ? 'Set the last working day first.' : 'The employee has no valid joining date.')
  const now = nowISO()
  const actorId = actorOrSystem?.id ?? null
  const c: LifecycleCase = {
    id: createId('lc'),
    kind,
    employeeId,
    templateId: template.id,
    keyDate: date,
    status: 'active',
    createdBy: actorId,
    createdAt: now,
    completedAt: null,
    timeline: [
      {
        id: createId('tl'),
        at: now,
        by: actorId,
        text: `${kind === 'onboarding' ? 'Onboarding' : 'Offboarding'} started from “${template.name}”${actorId ? '' : ' by automation'}`,
      },
    ],
    tasks: template.tasks.map((t) => ({
      id: createId('lct'),
      title: t.title,
      owner: t.owner,
      assigneeId: defaultAssignee(db, t.owner, employee),
      dueDate: addDays(date, t.offsetDays),
      status: 'open',
      requiresDocument: t.requiresDocument,
      externalAction: t.externalAction,
      documentId: null,
      completedAt: null,
      completedBy: null,
      note: '',
    })),
  }
  if (kind === 'onboarding') queueEvent({ type: 'onboarding.started', entity: { type: 'lifecycle', id: c.id }, employeeId, actorId, data: { date } })
  transact((d) => {
    let next: Database = { ...d, lifecycleCases: [c, ...d.lifecycleCases] }
    if (kind === 'offboarding' && employee.status !== 'offboarding')
      next = applyEmployeePatch(next, employeeId, { status: 'offboarding', endDate: date }, actorId, 'Offboarding started')
    next = withAudit(
      next,
      actorId,
      `lifecycle.${kind}_started`,
      { type: 'lifecycle', id: c.id },
      `${employee.firstName} ${employee.lastName}: ${template.name}`,
    )
    const assignees = [...new Set(c.tasks.map((t) => t.assigneeId).filter(Boolean) as ID[])]
    return withNotifications(
      next,
      assignees.map((accountId) => ({
        accountId,
        title: `${kind === 'onboarding' ? 'Onboarding' : 'Offboarding'} tasks for ${employee.firstName} ${employee.lastName}`,
        body: `${c.tasks.filter((t) => t.assigneeId === accountId).length} task(s) assigned to you`,
        link: `/lifecycle/${c.id}`,
        kind: 'lifecycle' as const,
      })),
    )
  })
  return c
}

function getCase(id: ID): LifecycleCase {
  const c = store.db.lifecycleCases.find((x) => x.id === id)
  if (!c) throw new ServiceError('Checklist not found.', 'not_found')
  return c
}

function finalize(db: Database, caseId: ID, actorId: ID): Database {
  const c = db.lifecycleCases.find((x) => x.id === caseId) as LifecycleCase
  if (c.status !== 'active' || c.tasks.some((t) => t.status === 'open')) return db
  let next: Database = {
    ...db,
    lifecycleCases: replaceById(db.lifecycleCases, caseId, (x) => ({
      ...x,
      status: 'completed',
      completedAt: nowISO(),
      timeline: [...x.timeline, { id: createId('tl'), at: nowISO(), by: actorId, text: 'All tasks complete' }],
    })),
  }
  const e = next.employees.find((x) => x.id === c.employeeId)
  if (e && c.kind === 'onboarding' && e.status === 'pre_boarding' && e.joinDate <= today())
    next = applyEmployeePatch(next, e.id, { status: 'active' }, actorId, 'Onboarding completed')
  if (e && c.kind === 'offboarding' && e.endDate && e.endDate <= today()) {
    next = applyEmployeePatch(next, e.id, { status: 'terminated' }, actorId, 'Offboarding completed')
    next = { ...next, accounts: next.accounts.map((a) => (a.employeeId === e.id ? { ...a, status: 'suspended' } : a)) }
  }
  return next
}

export function completeTask(actor: Account, caseId: ID, taskId: ID, note: string, confirmExternal = false) {
  const c = getCase(caseId)
  const task = c.tasks.find((t) => t.id === taskId)
  if (!task) throw new ServiceError('Task not found.', 'not_found')
  if (!canManageTask(actor, task)) throw new ServiceError('This task is assigned to someone else.', 'forbidden')
  if (c.status !== 'active') throw new ServiceError('This checklist is closed.', 'conflict')
  if (task.requiresDocument && !task.documentId) throw new ServiceError('Upload the required document before completing this task.')
  if (task.externalAction && !confirmExternal) throw new ServiceError('Confirm that this action was completed in the external system.')
  transact((d) => {
    let next: Database = {
      ...d,
      lifecycleCases: replaceById(d.lifecycleCases, caseId, (x) => ({
        ...x,
        tasks: x.tasks.map((t) => (t.id === taskId ? { ...t, status: 'done', completedAt: nowISO(), completedBy: actor.id, note: note.trim() } : t)),
        timeline: [
          ...x.timeline,
          {
            id: createId('tl'),
            at: nowISO(),
            by: actor.id,
            text: `Completed: ${task.title}${task.externalAction ? ' (confirmed done in the external system — not performed by PeopleOS)' : ''}`,
          },
        ],
      })),
    }
    next = finalize(next, caseId, actor.id)
    return withAudit(next, actor.id, 'lifecycle.task_completed', { type: 'lifecycle', id: caseId }, task.title)
  })
}

export function reopenTask(actor: Account, caseId: ID, taskId: ID) {
  if (!can(actor, 'lifecycle.manage')) throw new ServiceError('Only HR can reopen tasks.', 'forbidden')
  const c = getCase(caseId)
  const task = c.tasks.find((t) => t.id === taskId)
  if (!task) throw new ServiceError('Task not found.', 'not_found')
  transact((d) => ({
    ...d,
    lifecycleCases: replaceById(d.lifecycleCases, caseId, (x) => ({
      ...x,
      status: 'active',
      completedAt: null,
      tasks: x.tasks.map((t) => (t.id === taskId ? { ...t, status: 'open', completedAt: null, completedBy: null } : t)),
      timeline: [...x.timeline, { id: createId('tl'), at: nowISO(), by: actor.id, text: `Reopened: ${task.title}` }],
    })),
  }))
}

export function skipTask(actor: Account, caseId: ID, taskId: ID, reason: string) {
  if (!can(actor, 'lifecycle.manage')) throw new ServiceError('Only HR can skip tasks.', 'forbidden')
  if (!reason.trim()) throw new ServiceError('Explain why the task is not needed.')
  const task = getCase(caseId).tasks.find((t) => t.id === taskId)
  if (!task) throw new ServiceError('Task not found.', 'not_found')
  transact((d) =>
    finalize(
      {
        ...d,
        lifecycleCases: replaceById(d.lifecycleCases, caseId, (x) => ({
          ...x,
          tasks: x.tasks.map((t) => (t.id === taskId ? { ...t, status: 'skipped', note: reason.trim(), completedAt: nowISO(), completedBy: actor.id } : t)),
          timeline: [...x.timeline, { id: createId('tl'), at: nowISO(), by: actor.id, text: `Skipped: ${task.title} — ${reason.trim()}` }],
        })),
      },
      caseId,
      actor.id,
    ),
  )
}

export function reassignTask(actor: Account, caseId: ID, taskId: ID, assigneeId: ID | null) {
  if (!can(actor, 'lifecycle.manage')) throw new ServiceError('Only HR can reassign tasks.', 'forbidden')
  const to = assigneeId ? store.db.accounts.find((a) => a.id === assigneeId && a.status === 'active') : null
  if (assigneeId && !to) throw new ServiceError('Choose an active user.')
  const task = getCase(caseId).tasks.find((t) => t.id === taskId)
  if (!task) throw new ServiceError('Task not found.', 'not_found')
  transact((d) => {
    const next = {
      ...d,
      lifecycleCases: replaceById(d.lifecycleCases, caseId, (x) => ({
        ...x,
        tasks: x.tasks.map((t) => (t.id === taskId ? { ...t, assigneeId } : t)),
        timeline: [...x.timeline, { id: createId('tl'), at: nowISO(), by: actor.id, text: `${task.title} → ${to?.name ?? 'HR queue'}` }],
      })),
    }
    return to
      ? withNotifications(next, [
          { accountId: to.id, title: `Task assigned: ${task.title}`, body: `Due ${task.dueDate}`, link: `/lifecycle/${caseId}`, kind: 'lifecycle' },
        ])
      : next
  })
}

export function setTaskDueDate(actor: Account, caseId: ID, taskId: ID, dueDate: string) {
  if (!can(actor, 'lifecycle.manage')) throw new ServiceError('Only HR can change due dates.', 'forbidden')
  if (!isValidISODate(dueDate)) throw new ServiceError('Enter a valid date.')
  transact((d) => ({
    ...d,
    lifecycleCases: replaceById(d.lifecycleCases, caseId, (x) => ({ ...x, tasks: x.tasks.map((t) => (t.id === taskId ? { ...t, dueDate } : t)) })),
  }))
}

export async function attachTaskDocument(actor: Account, caseId: ID, taskId: ID, file: File) {
  const c = getCase(caseId)
  const task = c.tasks.find((t) => t.id === taskId)
  if (!task) throw new ServiceError('Task not found.', 'not_found')
  if (!canManageTask(actor, task)) throw new ServiceError('This task is assigned to someone else.', 'forbidden')
  const stored = await files.upload(file, `employees/${c.employeeId}`)
  const doc = {
    id: createId('doc'),
    name: stored.name,
    kind: 'other' as const,
    fileId: stored.fileId,
    size: stored.size,
    uploadedAt: nowISO(),
    uploadedBy: actor.id,
    expiresOn: null,
  }
  transact((d) => ({
    ...d,
    employees: replaceById(d.employees, c.employeeId, (e) => ({ ...e, documents: [doc, ...e.documents] })),
    lifecycleCases: replaceById(d.lifecycleCases, caseId, (x) => ({
      ...x,
      tasks: x.tasks.map((t) => (t.id === taskId ? { ...t, documentId: doc.id } : t)),
      timeline: [...x.timeline, { id: createId('tl'), at: nowISO(), by: actor.id, text: `Document uploaded for “${task.title}”: ${doc.name}` }],
    })),
  }))
}

export function cancelCase(actor: Account, caseId: ID, reason: string) {
  if (!can(actor, 'lifecycle.manage')) throw new ServiceError('Only HR can cancel a checklist.', 'forbidden')
  if (!reason.trim()) throw new ServiceError('Give a reason.')
  transact((d) =>
    withAudit(
      {
        ...d,
        lifecycleCases: replaceById(d.lifecycleCases, caseId, (x) => ({
          ...x,
          status: 'cancelled',
          timeline: [...x.timeline, { id: createId('tl'), at: nowISO(), by: actor.id, text: `Cancelled: ${reason.trim()}` }],
        })),
      },
      actor.id,
      'lifecycle.cancelled',
      { type: 'lifecycle', id: caseId },
      reason.trim(),
    ),
  )
}

export function caseProgress(c: LifecycleCase) {
  const total = c.tasks.length
  const done = c.tasks.filter((t) => t.status !== 'open').length
  const overdue = c.tasks.filter((t) => t.status === 'open' && t.dueDate < today()).length
  return { total, done, overdue, percent: total ? Math.round((done / total) * 100) : 0 }
}
