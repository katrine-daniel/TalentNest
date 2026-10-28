import { dataStore } from '@/services/storage/dataStore'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, pushNotification } from '@/services/activityService'
import { createId } from '@/utils/ids'
import type { Task } from '@/types/domain'

interface Ctx {
  actorId: string
}

export function isTaskOverdue(task: Pick<Task, 'status' | 'dueDate'>, now = Date.now()) {
  return task.status === 'open' && Boolean(task.dueDate) && new Date(task.dueDate as string).getTime() < now
}

function patch(id: string, updater: (t: Task) => Task) {
  let updated: Task | undefined
  dataStore.write('tasks', (list) => list.map((t) => (t.id === id ? (updated = updater(t)) : t)))
  if (!updated) throw new ServiceError('Task not found', 'not-found')
  return updated
}

export const taskService = {
  async create(
    {
      title,
      assigneeId,
      dueDate,
      candidateId = null,
      applicationId = null,
    }: { title: string; assigneeId: string | null; dueDate: string | null; candidateId?: string | null; applicationId?: string | null },
    { actorId }: Ctx,
  ) {
    if (title.trim().length < 3) throw new ServiceError('Describe the task (3+ characters)')
    return mockRequest(
      () => {
        const task: Task = {
          id: createId('task'),
          title: title.trim(),
          assigneeId,
          dueDate,
          status: 'open',
          candidateId,
          applicationId,
          createdById: actorId,
          createdAt: new Date().toISOString(),
          completedAt: null,
          sourceKey: null,
        }
        dataStore.write('tasks', (list) => [task, ...list])
        if (assigneeId && assigneeId !== actorId) {
          const by = dataStore.read('users').find((u) => u.id === actorId)?.name ?? 'A teammate'
          pushNotification({
            type: 'task',
            title: `${by} assigned you a task`,
            body: task.title,
            link: candidateId ? `/candidates/${candidateId}` : '/tasks',
            userId: assigneeId,
          })
        }
        if (candidateId) logActivity({ type: 'task', text: `Task created: ${task.title}`, actorId, candidateId })
        return task
      },
      { latency: 200 },
    )
  },

  async toggle(id: string, { actorId }: Ctx) {
    return mockRequest(
      () => {
        const t = patch(id, (t) => ({
          ...t,
          status: t.status === 'open' ? 'done' : 'open',
          completedAt: t.status === 'open' ? new Date().toISOString() : null,
        }))
        if (t.candidateId)
          logActivity({ type: 'task', text: `Task ${t.status === 'done' ? 'completed' : 'reopened'}: ${t.title}`, actorId, candidateId: t.candidateId })
        return t
      },
      { latency: 120 },
    )
  },

  async reassign(id: string, assigneeId: string | null) {
    return mockRequest(() => patch(id, (t) => ({ ...t, assigneeId })), { latency: 120 })
  },

  async remove(id: string) {
    return mockRequest(() => dataStore.write('tasks', (list) => list.filter((t) => t.id !== id)), { latency: 120 })
  },
}
