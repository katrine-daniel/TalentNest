import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus, Trash2, Zap } from 'lucide-react'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import { Input, Select } from '@/components/ui/FormControls'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useCollection, useLookups, fullName } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import { formatRelative, toInputDate, combineDateTime, addDays } from '@/utils/formatDate'
import { cn } from '@/utils/cn'
import type { Task } from '@/types/domain'
import { isTaskOverdue, taskService } from '../taskService'

interface TaskListProps {
  tasks: Task[]
  /** Pre-links new tasks to a candidate (candidate profile). */
  candidateId?: string
  showCandidate?: boolean
  emptyText?: string
  allowCreate?: boolean
}

/** Checklist of tasks with inline creation, completion and assignment. */
export default function TaskList({ tasks, candidateId, showCandidate = true, emptyText = 'No tasks here.', allowCreate = true }: TaskListProps) {
  const { actorId } = useSession()
  const users = useCollection('users')
  const { usersById, candidatesById } = useLookups()
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState(actorId)
  const [due, setDue] = useState(toInputDate(addDays(new Date(), 2)))
  const create = useAsyncAction((input: Parameters<typeof taskService.create>[0]) => taskService.create(input, { actorId }), { success: 'Task added' })
  const toggle = useAsyncAction((id: string) => taskService.toggle(id, { actorId }))
  const remove = useAsyncAction((id: string) => taskService.remove(id), { success: 'Task deleted' })

  const sorted = [...tasks].sort((a, b) =>
    a.status === b.status ? new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime() : a.status === 'open' ? -1 : 1,
  )

  return (
    <div>
      {allowCreate && (
        <form
          className="flex flex-wrap gap-2 px-5 pb-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const res = await create.run({ title, assigneeId, dueDate: due ? combineDateTime(due, '17:00') : null, candidateId: candidateId ?? null })
            if (res.ok) setTitle('')
          }}
        >
          <label htmlFor={`task-${candidateId ?? 'all'}`} className="sr-only">
            New task
          </label>
          <Input
            id={`task-${candidateId ?? 'all'}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task…"
            className="min-w-40 flex-1"
          />
          <Select
            aria-label="Assign to"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            options={users.filter((u) => u.status === 'active').map((u) => ({ value: u.id, label: u.name }))}
            className="w-40"
          />
          <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-36" />
          <Button type="submit" icon={Plus} loading={create.pending} disabled={title.trim().length < 3}>
            Add
          </Button>
        </form>
      )}
      {sorted.length === 0 ? (
        <EmptyState compact title={emptyText} />
      ) : (
        <ul className="divide-line border-line divide-y border-t">
          {sorted.map((t) => {
            const overdue = isTaskOverdue(t)
            const cand = t.candidateId ? candidatesById.get(t.candidateId) : undefined
            return (
              <li key={t.id} className="group flex items-center gap-3 px-5 py-2.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.status === 'done'}
                  aria-label={`Mark “${t.title}” as ${t.status === 'done' ? 'open' : 'done'}`}
                  onClick={() => toggle.run(t.id)}
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                    t.status === 'done' ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong hover:border-brand-400',
                  )}
                >
                  {t.status === 'done' && <Check size={12} strokeWidth={3} aria-hidden />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm', t.status === 'done' && 'text-muted line-through')}>
                    {t.sourceKey && <Zap size={12} className="text-brand-500 mr-1 inline" aria-label="Created by automation" />}
                    {t.title}
                  </p>
                  <p className="text-muted truncate text-xs">
                    {showCandidate && cand && (
                      <>
                        <Link to={`/candidates/${cand.id}`} className="hover:underline">
                          {fullName(cand)}
                        </Link>
                        {' · '}
                      </>
                    )}
                    {t.dueDate ? (
                      <span className={overdue ? 'font-medium text-red-600' : undefined}>
                        {overdue ? 'Overdue · ' : 'Due '}
                        {formatRelative(t.dueDate)}
                      </span>
                    ) : (
                      'No due date'
                    )}
                  </p>
                </div>
                {t.assigneeId && (
                  <Avatar name={usersById.get(t.assigneeId)?.name ?? '?'} size="xs" title={`Assigned to ${usersById.get(t.assigneeId)?.name ?? 'unknown'}`} />
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  iconOnly
                  icon={Trash2}
                  aria-label={`Delete task ${t.title}`}
                  onClick={() => remove.run(t.id)}
                  className="sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
