import { useMemo } from 'react'
import PageHeader from '@/components/layout/PageHeader'
import Panel from '@/components/ui/Panel'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { FilterSelect } from '@/components/ui/FormControls'
import { useCollection } from '@/hooks/useStore'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import { useSession } from '@/app/providers/SessionContext'
import TaskList from './components/TaskList'
import { isTaskOverdue } from './taskService'

export default function TasksPage() {
  const tasks = useCollection('tasks')
  const users = useCollection('users')
  const { actorId } = useSession()
  const { filters, setFilter } = useUrlFilters({ owner: 'me', status: 'open' })

  const visible = useMemo(
    () =>
      tasks.filter((t) => {
        if (filters.owner === 'me' && t.assigneeId !== actorId) return false
        if (filters.owner !== 'me' && filters.owner !== 'all' && t.assigneeId !== filters.owner) return false
        if (filters.status === 'open') return t.status === 'open'
        if (filters.status === 'overdue') return isTaskOverdue(t)
        if (filters.status === 'done') return t.status === 'done'
        return true
      }),
    [tasks, filters, actorId],
  )

  return (
    <div className="space-y-5">
      <PageHeader title="Tasks" description="Follow-ups for the hiring team. Tasks marked ⚡ were created by automation rules." />
      <Panel
        title={`${visible.length} task${visible.length === 1 ? '' : 's'}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <SegmentedControl
              size="sm"
              label="Status"
              value={filters.status}
              onChange={(v: string) => setFilter('status', v)}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'done', label: 'Done' },
                { value: 'any', label: 'All' },
              ]}
            />
            <FilterSelect
              label="Owner"
              allLabel="Everyone"
              value={filters.owner === 'me' ? 'me' : filters.owner}
              onChange={(v) => setFilter('owner', v)}
              options={[
                { value: 'me', label: 'Me' },
                ...users.filter((u) => u.status === 'active' && u.id !== actorId).map((u) => ({ value: u.id, label: u.name })),
              ]}
              className="w-48"
            />
          </div>
        }
      >
        <TaskList tasks={visible} emptyText="No tasks match these filters." />
      </Panel>
    </div>
  )
}
