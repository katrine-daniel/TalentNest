import { Link } from 'react-router-dom'
import { Columns3, MoreHorizontal, Pencil, MapPin } from 'lucide-react'
import DataTable, { CellActions } from '@/components/ui/DataTable'
import Dropdown from '@/components/ui/Dropdown'
import Button from '@/components/ui/Button'
import StatusBadge from '@/components/ui/StatusBadge'
import { STAGE_TYPES, toOptions } from '@/utils/statusHelpers'
import { formatRelative } from '@/utils/formatDate'

/** Thin stacked bar showing where a vacancy's active candidates sit. */
export function StageDistribution({ byStage, total }) {
  if (!total) return <span className="text-xs text-faint">No active candidates</span>
  return (
    <div className="flex h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-subtle" role="img" aria-label={byStage.filter((s) => s.count).map((s) => `${s.name}: ${s.count}`).join(', ')}>
      {byStage
        .filter((s) => s.count > 0)
        .map((s) => (
          <span key={s.id} className={STAGE_TYPES[s.type]?.dot} style={{ width: `${(s.count / total) * 100}%` }} title={`${s.name}: ${s.count}`} />
        ))}
    </div>
  )
}

export default function JobTable({ rows, sort, onSort, onOpen, onEdit, onStatus, canManage, empty }) {
  const statusItems = (row) =>
    toOptions('job').map((o) => ({
      key: o.value,
      label: `Mark ${o.label.toLowerCase()}`,
      checked: row.job.status === o.value,
      disabled: row.job.status === o.value || !canManage,
      onSelect: () => onStatus(row, o.value),
    }))

  const columns = [
    {
      key: 'title',
      header: 'Vacancy',
      sortable: true,
      render: (r) => (
        <div className="min-w-0">
          <Link to={`/jobs/${r.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:text-brand-700 hover:underline">
            {r.title}
          </Link>
          <span className="flex items-center gap-1 text-xs text-muted">
            {r.department?.name} · <MapPin size={11} aria-hidden /> {r.job.location}
          </span>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge kind="job" value={r.job.status} /> },
    { key: 'openings', header: 'Openings', sortable: true, hideBelow: 'md', align: 'right', render: (r) => <span className="tabular">{r.hired}/{r.job.openings}</span> },
    {
      key: 'applicants',
      header: 'Applicants',
      sortable: true,
      render: (r) => (
        <div className="space-y-1.5">
          <p className="text-sm tabular">
            {r.active} active <span className="text-muted">/ {r.applicants}</span>
            {r.newThisWeek > 0 && <span className="ml-1.5 text-xs text-brand-600">+{r.newThisWeek} this week</span>}
          </p>
          <StageDistribution byStage={r.byStage} total={r.active} />
        </div>
      ),
    },
    { key: 'recruiter', header: 'Recruiter', hideBelow: 'xl', render: (r) => <span className="text-ink-soft">{r.recruiter?.name}</span> },
    { key: 'createdAt', header: 'Posted', sortable: true, hideBelow: 'lg', render: (r) => <span className="text-ink-soft">{formatRelative(r.createdAt)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (r) => (
        <CellActions>
          <Dropdown
            menuLabel={`Actions for ${r.title}`}
            items={[
              { label: 'Edit vacancy', icon: Pencil, disabled: !canManage, onSelect: () => onEdit(r) },
              { label: 'Open pipeline', icon: Columns3, onSelect: () => onOpen(r, 'pipeline') },
              { divider: true },
              { heading: 'Status' },
              ...statusItems(r),
            ]}
            renderTrigger={(props) => <Button {...props} size="sm" variant="ghost" iconOnly icon={MoreHorizontal} aria-label={`Actions for ${r.title}`} />}
          />
        </CellActions>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      sort={sort}
      onSort={onSort}
      onRowClick={(r) => onOpen(r)}
      rowLabel={(r) => `Open ${r.title}`}
      empty={empty}
      mobileCard={(r) => (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{r.title}</p>
              <p className="text-xs text-muted">
                {r.department?.name} · {r.job.location}
              </p>
            </div>
            <StatusBadge kind="job" value={r.job.status} />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>
              {r.active} active · {r.hired}/{r.job.openings} filled
            </span>
            <StageDistribution byStage={r.byStage} total={r.active} />
          </div>
        </div>
      )}
    />
  )
}
