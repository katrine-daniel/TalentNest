import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, Plus, SearchX } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import Pagination from '@/components/ui/Pagination'
import EmptyState from '@/components/ui/EmptyState'
import SearchInput from '@/components/ui/SearchInput'
import { FilterSelect } from '@/components/ui/FormControls'
import JobTable from '@/components/jobs/JobTable'
import { JOB_FILTER_DEFAULTS, useJobActions, useJobs, useOrgOptions } from '@/hooks/useJobs'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import { useTableState } from '@/hooks/useTableState'
import { useGlobalActions } from '@/context/GlobalActionsContext'
import { useSession } from '@/context/SessionContext'

const sortValue = (r, key) => {
  if (key === 'createdAt') return new Date(r.createdAt).getTime()
  if (key === 'openings') return r.job.openings
  return r[key]
}

export default function JobsPage() {
  const navigate = useNavigate()
  const { filters, setFilter, reset } = useUrlFilters(JOB_FILTER_DEFAULTS)
  const { rows, statusCounts } = useJobs(filters)
  const options = useOrgOptions()
  const global = useGlobalActions()
  const jobActions = useJobActions()
  const { can } = useSession()
  const canManage = can('jobs.manage')
  const table = useTableState(rows, { initialSort: { key: 'createdAt', dir: 'desc' }, pageSize: 10, getValue: sortValue })
  const { setPage } = table
  useEffect(() => setPage(1), [filters.status, filters.q, filters.department, filters.recruiter, setPage])

  const tabs = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'draft', label: 'Draft' },
    { value: 'on-hold', label: 'On hold' },
    { value: 'closed', label: 'Closed' },
  ].map((t) => ({ ...t, count: statusCounts[t.value] ?? 0 }))

  return (
    <div>
      <PageHeader
        title="Jobs & Vacancies"
        description="Manage openings, owners and recruitment workflows across business lines."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => global.openJobForm()} disabled={!canManage}>
            New vacancy
          </Button>
        }
      />
      <div className="rounded-2xl border border-line/80 bg-surface shadow-card">
        <div className="px-4 pt-2">
          <Tabs tabs={tabs} value={filters.status} onChange={(v) => setFilter('status', v)} label="Vacancy status" />
        </div>
        <div className="grid gap-2 border-b border-line p-4 sm:grid-cols-3">
          <SearchInput value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search title, skill or location" label="Search vacancies" />
          <FilterSelect label="Department" value={filters.department} onChange={(v) => setFilter('department', v)} options={options.departments} />
          <FilterSelect label="Recruiter" value={filters.recruiter} onChange={(v) => setFilter('recruiter', v)} options={options.recruiters} />
        </div>
        <JobTable
          rows={table.rows}
          sort={table.sort}
          onSort={table.toggleSort}
          canManage={canManage}
          onOpen={(r, target) => navigate(target === 'pipeline' ? `/pipeline?job=${r.id}` : `/jobs/${r.id}`)}
          onEdit={(r) => global.openJobForm({ job: r.job })}
          onStatus={(r, status) => jobActions.setStatus.run(r.id, status)}
          empty={
            statusCounts.all === 0 ? (
              <EmptyState icon={BriefcaseBusiness} title="No vacancies yet" description="Create your first vacancy to start receiving applications." />
            ) : (
              <EmptyState icon={SearchX} title="No vacancies match" description="Adjust the search or filters." action={<Button onClick={reset}>Clear filters</Button>} />
            )
          }
        />
        <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={table.pageSize} onChange={table.setPage} label="vacancies" />
      </div>
    </div>
  )
}
