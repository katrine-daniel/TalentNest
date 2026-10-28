import { useMemo } from 'react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import { useCollection } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import TaskList from './TaskList'
import { isTaskOverdue } from '../taskService'

/** The signed-in user's open tasks (dashboard). */
export default function MyTasksPanel() {
  const tasks = useCollection('tasks')
  const { actorId } = useSession()
  const mine = useMemo(() => tasks.filter((t) => t.assigneeId === actorId && t.status === 'open'), [tasks, actorId])
  const overdue = mine.filter((t) => isTaskOverdue(t)).length
  return (
    <Panel
      title="My tasks"
      description={mine.length ? `${mine.length} open${overdue ? ` · ${overdue} overdue` : ''}` : 'Nothing assigned to you'}
      actions={
        <Button size="sm" variant="ghost" to="/tasks">
          All tasks
        </Button>
      }
    >
      <TaskList tasks={mine.slice(0, 8)} emptyText="You're all caught up." />
    </Panel>
  )
}
