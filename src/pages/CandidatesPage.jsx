import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Rows3, SearchX, UserPlus, Users } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Pagination from '@/components/ui/Pagination'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/FormControls'
import CandidateFilters from '@/components/candidates/CandidateFilters'
import CandidateTable from '@/components/candidates/CandidateTable'
import CandidateList from '@/components/candidates/CandidateList'
import CandidateDrawer from '@/components/candidates/CandidateDrawer'
import { CANDIDATE_FILTER_DEFAULTS, useCandidates } from '@/hooks/useCandidates'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import { useTableState } from '@/hooks/useTableState'
import { useGlobalActions } from '@/context/GlobalActionsContext'
import { useSession } from '@/context/SessionContext'

const SORT_OPTIONS = [
  { value: 'appliedAt:desc', label: 'Newest first' },
  { value: 'appliedAt:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'stageRank:desc', label: 'Furthest stage' },
  { value: 'experienceYears:desc', label: 'Most experience' },
]

const sortValue = (row, key) => {
  if (key === 'appliedAt') return new Date(row.appliedAt).getTime()
  if (key === 'experienceYears') return row.candidate.experienceYears
  return row[key]
}

export default function CandidatesPage() {
  const navigate = useNavigate()
  const { can } = useSession()
  const actions = useGlobalActions()
  const { filters, setFilter, reset, activeCount } = useUrlFilters(CANDIDATE_FILTER_DEFAULTS)
  const { rows, total } = useCandidates(filters)
  const table = useTableState(rows, { initialSort: { key: 'appliedAt', dir: 'desc' }, pageSize: 12, getValue: sortValue })
  const [drawerId, setDrawerId] = useState(null)
  const { setPage } = table

  useEffect(() => {
    setPage(1)
  }, [filters.q, filters.department, filters.job, filters.recruiter, filters.experience, filters.status, setPage])

  const open = useCallback(
    (row, full = false) => {
      if (full) navigate(`/candidates/${row.id}`)
      else setDrawerId(row.id)
    },
    [navigate],
  )

  const empty = useMemo(
    () =>
      total === 0 ? (
        <EmptyState icon={Users} title="No candidates yet" description="Add your first candidate or import applications from a vacancy." action={<Button variant="primary" icon={UserPlus} onClick={() => actions.openCandidateForm()}>Add candidate</Button>} />
      ) : (
        <EmptyState icon={SearchX} title="No candidates match these filters" description="Try a different search term or clear some filters." action={<Button onClick={reset}>Clear filters</Button>} />
      ),
    [total, actions, reset],
  )

  return (
    <div>
      <PageHeader
        title="Candidates"
        description={`${total} candidates across all vacancies`}
        actions={
          <Button variant="primary" icon={UserPlus} onClick={() => actions.openCandidateForm()} disabled={!can('candidates.manage')}>
            Add candidate
          </Button>
        }
      />

      <div className="rounded-2xl border border-line/80 bg-surface shadow-card">
        <div className="space-y-3 border-b border-line p-4">
          <CandidateFilters filters={filters} setFilter={setFilter} reset={reset} activeCount={activeCount} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted" aria-live="polite">
              {rows.length === total ? `Showing all ${total}` : `${rows.length} of ${total} match`}
            </p>
            <div className="flex items-center gap-2">
              <Select
                aria-label="Sort candidates"
                value={`${table.sort.key}:${table.sort.dir}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(':')
                  table.setSort({ key, dir })
                }}
                options={SORT_OPTIONS}
                className="h-9! w-44 text-xs"
              >
                {!SORT_OPTIONS.some((o) => o.value === `${table.sort.key}:${table.sort.dir}`) && <option value={`${table.sort.key}:${table.sort.dir}`}>Custom sort</option>}
              </Select>
              <SegmentedControl
                className="max-md:hidden"
                label="View"
                value={filters.view}
                onChange={(v) => setFilter('view', v)}
                options={[
                  { value: 'table', label: 'Table view', icon: Rows3, iconOnly: true },
                  { value: 'list', label: 'Compact list view', icon: LayoutGrid, iconOnly: true },
                ]}
              />
            </div>
          </div>
        </div>

        {filters.view === 'list' && rows.length > 0 ? (
          <div className="hidden md:block">
            <CandidateList rows={table.rows} onOpen={open} />
          </div>
        ) : null}
        <div className={filters.view === 'list' && rows.length > 0 ? 'md:hidden' : undefined}>
          <CandidateTable
            rows={table.rows}
            sort={table.sort}
            onSort={table.toggleSort}
            onOpen={open}
            canSchedule={can('interviews.schedule')}
            onSchedule={(r) => actions.openSchedule({ applicationId: r.primary?.app.id })}
            empty={empty}
          />
        </div>
        <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={table.pageSize} onChange={table.setPage} label="candidates" />
      </div>

      <CandidateDrawer candidateId={drawerId} open={Boolean(drawerId)} onClose={() => setDrawerId(null)} />
    </div>
  )
}
