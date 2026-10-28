import { Link } from 'react-router-dom'
import { CalendarPlus, ExternalLink, MoreHorizontal, PanelRight } from 'lucide-react'
import DataTable, { CellActions } from '@/components/ui/DataTable'
import Avatar from '@/components/ui/Avatar'
import Dropdown from '@/components/ui/Dropdown'
import Button from '@/components/ui/Button'
import StageBadge from './StageBadge'
import { CandidateSummary } from './CandidateList'
import { formatRelative } from '@/utils/formatDate'

/** Sortable candidate table; collapses to summary cards on phones. */
export default function CandidateTable({ rows, sort, onSort, onOpen, onSchedule, canSchedule, empty }) {
  const columns = [
    {
      key: 'name',
      header: 'Candidate',
      sortable: true,
      render: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={r.name} size="sm" />
          <div className="min-w-0">
            <Link to={`/candidates/${r.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-ink hover:text-brand-700 hover:underline">
              {r.name}
            </Link>
            <span className="block truncate text-xs text-muted">
              {r.candidate.ref} · {r.candidate.email}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'job',
      header: 'Applied for',
      hideBelow: 'lg',
      render: (r) =>
        r.primary ? (
          <div className="max-w-56 min-w-0">
            <span className="block truncate text-sm">{r.primary.job.title}</span>
            {r.apps.length > 1 && <span className="text-xs text-muted">+{r.apps.length - 1} more application{r.apps.length > 2 ? 's' : ''}</span>}
          </div>
        ) : (
          <span className="text-xs text-faint">Talent pool</span>
        ),
    },
    { key: 'stageRank', header: 'Stage', sortable: true, render: (r) => <StageBadge app={r.primary?.app} stage={r.primary?.stage} /> },
    { key: 'experienceYears', header: 'Exp.', sortable: true, hideBelow: 'md', render: (r) => <span className="tabular text-ink-soft">{r.candidate.experienceYears} yrs</span> },
    { key: 'recruiter', header: 'Recruiter', hideBelow: 'xl', render: (r) => <span className="text-ink-soft">{r.recruiter?.name ?? '—'}</span> },
    { key: 'appliedAt', header: 'Applied', sortable: true, hideBelow: 'lg', render: (r) => <span className="whitespace-nowrap text-ink-soft">{formatRelative(r.appliedAt)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (r) => (
        <CellActions>
          <Dropdown
            menuLabel={`Actions for ${r.name}`}
            items={[
              { label: 'Quick view', icon: PanelRight, onSelect: () => onOpen(r) },
              { label: 'Open profile', icon: ExternalLink, onSelect: () => onOpen(r, true) },
              { label: 'Schedule interview', icon: CalendarPlus, disabled: !canSchedule || r.primary?.app.status !== 'active', onSelect: () => onSchedule(r) },
            ]}
            renderTrigger={(props) => <Button {...props} size="sm" variant="ghost" iconOnly icon={MoreHorizontal} aria-label={`Actions for ${r.name}`} />}
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
      rowLabel={(r) => `Open quick view for ${r.name}`}
      mobileCard={(r) => <CandidateSummary row={r} />}
      empty={empty}
    />
  )
}
