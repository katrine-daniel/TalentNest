import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, CalendarPlus2, CircleSlash, ClipboardCheck, ClipboardList, Gauge, Hourglass, MoreHorizontal, PenLine, SearchX, Timer } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import DataTable, { CellActions } from '@/components/ui/DataTable'
import Dropdown from '@/components/ui/Dropdown'
import Pagination from '@/components/ui/Pagination'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SearchInput from '@/components/ui/SearchInput'
import { FilterSelect } from '@/components/ui/FormControls'
import MetricCard, { MetricStrip } from '@/features/dashboard/components/MetricCard'
import ScoreAssessmentModal from '@/features/assessments/components/ScoreAssessmentModal'
import { useAssessmentRows, useSchedulingActions } from '@/features/interviews/hooks/useScheduling'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import { useTableState } from '@/hooks/useTableState'
import { useOrgOptions } from '@/features/jobs/hooks/useJobs'
import { useCollection } from '@/hooks/useStore'
import { useGlobalActions } from '@/app/providers/GlobalActionsContext'
import { useSession } from '@/app/providers/SessionContext'
import { formatDate, formatRelative, addDays, toInputDate, combineDateTime } from '@/utils/formatDate'

const DEFAULTS = { q: '', status: 'all', department: 'all', template: 'all' }

const sortValue = (r, key) => {
  if (key === 'deadline') return new Date(r.assessment.deadline).getTime()
  if (key === 'score') return r.assessment.score
  if (key === 'candidateName') return r.candidateName
  return r[key]
}

export default function AssessmentsPage() {
  const { filters, setFilter } = useUrlFilters(DEFAULTS)
  const navigate = useNavigate()
  const options = useOrgOptions()
  const templates = useCollection('assessmentTemplates')
  const global = useGlobalActions()
  const actions = useSchedulingActions()
  const { can } = useSession()
  const canManage = can('interviews.schedule')
  const [scoring, setScoring] = useState(null)
  const [cancelling, setCancelling] = useState(null)

  const allRows = useAssessmentRows({ department: filters.department, template: filters.template, q: filters.q })
  const rows = useMemo(
    () =>
      allRows.filter((r) =>
        filters.status === 'all' ? r.assessment.status !== 'cancelled' : filters.status === 'overdue' ? r.overdue : r.assessment.status === filters.status,
      ),
    [allRows, filters.status],
  )
  const table = useTableState(rows, { initialSort: { key: 'deadline', dir: 'asc' }, pageSize: 12, getValue: sortValue })
  const { setPage } = table
  useEffect(() => setPage(1), [filters.status, filters.q, filters.department, filters.template, setPage])

  const counts = useMemo(() => {
    const c = { all: 0, pending: 0, 'in-progress': 0, submitted: 0, evaluated: 0, overdue: 0 }
    allRows.forEach((r) => {
      if (r.assessment.status !== 'cancelled') c.all += 1
      c[r.assessment.status] = (c[r.assessment.status] ?? 0) + 1
      if (r.overdue) c.overdue += 1
    })
    return c
  }, [allRows])

  const evaluated = allRows.filter((r) => r.assessment.status === 'evaluated')
  const passRate = evaluated.length ? Math.round((evaluated.filter((r) => r.passed).length / evaluated.length) * 100) : 0

  const extend = (r) => {
    const base = new Date(Math.max(Date.now(), new Date(r.assessment.deadline).getTime()))
    actions.extendDeadline.run(r.id, combineDateTime(toInputDate(addDays(base, 2)), '18:00'))
  }

  const columns = [
    {
      key: 'candidateName',
      header: 'Candidate',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.candidateName} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{r.candidateName}</p>
            <p className="text-muted truncate text-xs">{r.job.title}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'template',
      header: 'Assessment',
      hideBelow: 'lg',
      render: (r) => (
        <div>
          <p className="text-sm">{r.template?.name}</p>
          <p className="text-muted text-xs">
            {r.template?.type} · {r.template?.durationMin} min
          </p>
        </div>
      ),
    },
    { key: 'assigned', header: 'Assigned', hideBelow: 'xl', render: (r) => <span className="text-ink-soft">{formatDate(r.assessment.assignedAt)}</span> },
    {
      key: 'deadline',
      header: 'Deadline',
      sortable: true,
      render: (r) => (
        <span className={r.overdue ? 'font-medium text-red-600' : 'text-ink-soft'}>
          {formatRelative(r.assessment.deadline)}
          {r.assessment.reminderSentAt && <BellRing size={12} className="text-brand-500 ml-1.5 inline" aria-label="Reminder sent" />}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (r.overdue ? <StatusBadge tone="red">Overdue</StatusBadge> : <StatusBadge kind="assessment" value={r.assessment.status} />),
    },
    {
      key: 'score',
      header: 'Score',
      sortable: true,
      align: 'right',
      hideBelow: 'md',
      render: (r) =>
        r.assessment.score != null ? (
          <span className={`tabular font-semibold ${r.passed ? 'text-emerald-700' : 'text-red-600'}`}>{r.assessment.score}%</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (r) => {
        const open = ['pending', 'in-progress', 'submitted'].includes(r.assessment.status)
        return (
          <CellActions>
            <Dropdown
              menuLabel={`Actions for ${r.candidateName}`}
              items={[
                {
                  label: 'Record score',
                  icon: PenLine,
                  disabled: !canManage || !['submitted', 'evaluated', 'in-progress'].includes(r.assessment.status),
                  onSelect: () => setScoring(r),
                },
                {
                  label: 'Send reminder',
                  icon: BellRing,
                  disabled: !canManage || !['pending', 'in-progress'].includes(r.assessment.status),
                  onSelect: () => actions.remindAssessment.run(r.id),
                },
                {
                  label: 'Extend deadline by 2 days',
                  icon: CalendarPlus2,
                  disabled: !canManage || !['pending', 'in-progress'].includes(r.assessment.status),
                  onSelect: () => extend(r),
                },
                { label: 'View candidate', icon: ClipboardList, onSelect: () => navigate(`/candidates/${r.candidate.id}`) },
                { divider: true },
                { label: 'Cancel assessment', icon: CircleSlash, danger: true, disabled: !canManage || !open, onSelect: () => setCancelling(r) },
              ]}
              renderTrigger={(props) => (
                <Button {...props} size="sm" variant="ghost" iconOnly icon={MoreHorizontal} aria-label={`Actions for ${r.candidateName}`} />
              )}
            />
          </CellActions>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessments"
        description="Assign tests, track deadlines and record results."
        actions={
          <Button variant="primary" icon={ClipboardCheck} onClick={() => global.openAssessment()} disabled={!canManage}>
            Assign assessment
          </Button>
        }
      />

      <MetricStrip columns={5}>
        <MetricCard label="Not started" icon={Hourglass} value={counts.pending} />
        <MetricCard label="In progress" icon={Timer} value={counts['in-progress']} />
        <MetricCard label="Awaiting review" icon={PenLine} value={counts.submitted} detail="Submitted by candidates" emphasis={counts.submitted > 0} />
        <MetricCard
          label="Overdue"
          icon={BellRing}
          value={counts.overdue}
          detail={counts.overdue ? 'Send a reminder or extend' : 'All on time'}
          detailTone={counts.overdue ? 'danger' : 'muted'}
        />
        <MetricCard label="Pass rate" icon={Gauge} value={passRate} detail={`% across ${evaluated.length} evaluated`} />
      </MetricStrip>

      <div className="border-line/80 bg-surface shadow-card rounded-2xl border">
        <div className="px-4 pt-2">
          <Tabs
            value={filters.status}
            onChange={(v) => setFilter('status', v)}
            label="Assessment status"
            tabs={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'submitted', label: 'Awaiting review', count: counts.submitted },
              { value: 'overdue', label: 'Overdue', count: counts.overdue },
              { value: 'pending', label: 'Not started', count: counts.pending },
              { value: 'in-progress', label: 'In progress', count: counts['in-progress'] },
              { value: 'evaluated', label: 'Evaluated', count: counts.evaluated },
            ]}
          />
        </div>
        <div className="border-line grid gap-2 border-b p-4 sm:grid-cols-3">
          <SearchInput value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search candidate or vacancy" label="Search assessments" />
          <FilterSelect label="Department" value={filters.department} onChange={(v) => setFilter('department', v)} options={options.departments} />
          <FilterSelect
            label="Assessment"
            value={filters.template}
            onChange={(v) => setFilter('template', v)}
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
          />
        </div>
        <DataTable
          columns={columns}
          rows={table.rows}
          sort={table.sort}
          onSort={table.toggleSort}
          mobileCard={(r) => (
            <div className="flex items-start gap-3">
              <Avatar name={r.candidateName} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium">{r.candidateName}</p>
                  {r.assessment.score != null ? (
                    <span className={`text-sm font-semibold ${r.passed ? 'text-emerald-700' : 'text-red-600'}`}>{r.assessment.score}%</span>
                  ) : r.overdue ? (
                    <StatusBadge tone="red">Overdue</StatusBadge>
                  ) : (
                    <StatusBadge kind="assessment" value={r.assessment.status} />
                  )}
                </div>
                <p className="text-muted truncate text-xs">{r.template?.name}</p>
                <p className="text-ink-soft mt-1 text-xs">Due {formatRelative(r.assessment.deadline)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.assessment.status === 'submitted' && (
                    <Button size="xs" variant="primary" onClick={() => setScoring(r)} disabled={!canManage}>
                      Record score
                    </Button>
                  )}
                  {['pending', 'in-progress'].includes(r.assessment.status) && (
                    <>
                      <Button size="xs" onClick={() => actions.remindAssessment.run(r.id)} disabled={!canManage}>
                        Remind
                      </Button>
                      <Button size="xs" onClick={() => extend(r)} disabled={!canManage}>
                        +2 days
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          empty={<EmptyState icon={SearchX} title="No assessments here" description="Try another status tab or clear the filters." />}
        />
        <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={table.pageSize} onChange={table.setPage} label="assessments" />
      </div>

      <ScoreAssessmentModal row={scoring} onClose={() => setScoring(null)} />
      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title="Cancel this assessment?"
        description={cancelling ? `${cancelling.candidateName} will no longer be expected to complete ${cancelling.template?.name}.` : ''}
        confirmLabel="Cancel assessment"
        tone="danger"
        loading={actions.cancelAssessment.pending}
        onConfirm={async () => {
          const res = await actions.cancelAssessment.run(cancelling.id)
          if (res.ok) setCancelling(null)
        }}
      />
    </div>
  )
}
