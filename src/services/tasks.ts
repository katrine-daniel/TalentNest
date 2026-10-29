import { isValidISODate } from '@/lib/dates'
import { createId, nowISO } from '@/lib/utils'
import { isHR } from '@/domain/permissions'
import type { Account, Database, EntityRef, ID, Priority, Task } from '@/domain/types'
import { withAudit, withNotifications } from './activity'
import { replaceById, ServiceError, store } from './store'
import { required, transact } from './tx'

export function visibleTasks(db: Database, actor: Account): Task[] {
  return isHR(actor) ? db.tasks : db.tasks.filter((t) => t.assigneeId === actor.id || t.createdBy === actor.id)
}

export function createTaskRecord(db: Database, t: { title: string; description?: string; assigneeId: ID | null; dueDate: string | null; priority: Priority; link: EntityRef | null; sourceKey: string | null; createdBy: ID | null }): { db: Database; task: Task | null } {
  // Idempotency for automation-created tasks.
  if (t.sourceKey && db.tasks.some((x) => x.sourceKey === t.sourceKey)) return { db, task: null }
  const task: Task = { id: createId('task'), title: t.title, description: t.description ?? '', assigneeId: t.assigneeId, dueDate: t.dueDate, status: 'open', priority: t.priority, link: t.link, sourceKey: t.sourceKey, createdBy: t.createdBy, createdAt: nowISO(), completedAt: null }
  let next: Database = { ...db, tasks: [task, ...db.tasks] }
  if (task.assigneeId && task.assigneeId !== t.createdBy) next = withNotifications(next, [{ accountId: task.assigneeId, title: `New task: ${task.title}`, body: task.dueDate ? `Due ${task.dueDate}` : '', link: '/inbox', kind: 'task' }])
  return { db: next, task }
}

export function createTask(actor: Account, input: { title: string; description: string; assigneeId: ID | null; dueDate: string | null; priority: Priority; link?: EntityRef | null }) {
  const title = required(input.title, 'Title')
  if (input.dueDate && !isValidISODate(input.dueDate)) throw new ServiceError('Enter a valid due date.')
  if (input.assigneeId && input.assigneeId !== actor.id && !isHR(actor) && actor.role !== 'manager') throw new ServiceError('You can only create tasks for yourself.', 'forbidden')
  transact((d) => createTaskRecord(d, { ...input, title, link: input.link ?? null, sourceKey: null, createdBy: actor.id }).db)
}

export function completeTaskItem(actor: Account, id: ID, done = true) {
  const t = store.db.tasks.find((x) => x.id === id)
  if (!t) throw new ServiceError('Task not found.', 'not_found')
  if (t.assigneeId !== actor.id && t.createdBy !== actor.id && !isHR(actor)) throw new ServiceError('This task is assigned to someone else.', 'forbidden')
  transact((d) => withAudit({ ...d, tasks: replaceById(d.tasks, id, (x) => ({ ...x, status: done ? 'done' : 'open', completedAt: done ? nowISO() : null })) }, actor.id, done ? 'task.completed' : 'task.reopened', { type: 'account', id: actor.id }, t.title))
}

export function reassignTaskItem(actor: Account, id: ID, assigneeId: ID | null) {
  if (!isHR(actor)) throw new ServiceError('Only HR can reassign tasks.', 'forbidden')
  const t = store.db.tasks.find((x) => x.id === id)
  if (!t) throw new ServiceError('Task not found.', 'not_found')
  transact((d) => {
    const next = { ...d, tasks: replaceById(d.tasks, id, (x) => ({ ...x, assigneeId })) }
    return assigneeId ? withNotifications(next, [{ accountId: assigneeId, title: `Task assigned: ${t.title}`, body: '', link: '/inbox', kind: 'task' }]) : next
  })
}
