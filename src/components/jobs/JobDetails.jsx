import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Users } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import DataTable from '@/components/ui/DataTable'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import ChartTooltip, { AXIS_PROPS, CHART_COLORS } from '@/components/ui/ChartTooltip'
import StageBadge from '@/components/candidates/StageBadge'
import { SkillsList } from '@/components/candidates/CandidateProfile'
import RecentActivity from '@/components/dashboard/RecentActivity'
import { WorkflowPreview } from './WorkflowBuilder'
import { useTableState } from '@/hooks/useTableState'
import { useCollection, useLookups, fullName } from '@/hooks/useStore'
import { formatRelative, startOfWeek, addDays, formatShortDate } from '@/utils/formatDate'
import { STAGE_TYPES } from '@/utils/statusHelpers'

const inr = (n) => (n ? `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L` : '—')

export function JobOverview({ row }) {
  const { job } = row
  const facts = [
    ['Department', row.department?.name],
    ['Category', job.category],
    ['Location', `${job.location} · ${job.workMode}`],
    ['Employment', job.employmentType],
    ['Experience', `${job.experienceMin}–${job.experienceMax} years`],
    ['Salary band', `${inr(job.salaryMin)} – ${inr(job.salaryMax)} per annum`],
    ['Hiring manager', row.hiringManager?.name],
    ['Recruiter', row.recruiter?.name],
  ]
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Panel title="About the role" className="lg:col-span-2" bodyClassName="px-5 pb-5 space-y-5">
        <p className="text-sm leading-relaxed whitespace-pre-line text-ink-soft">{job.description}</p>
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Required skills</h3>
          <SkillsList skills={job.skills} highlight={job.skills} />
        </div>
      </Panel>
      <Panel title="Details" bodyClassName="px-5 pb-5">
        <dl className="space-y-3 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right text-ink">{v ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  )
}

export function JobApplicants({ job }) {
  const applications = useCollection('applications')
  const { candidatesById } = useLookups()
  const navigate = useNavigate()
  const rows = useMemo(
    () =>
      applications
        .filter((a) => a.jobId === job.id)
        .map((app) => {
          const candidate = candidatesById.get(app.candidateId)
          const stage = job.stages.find((s) => s.id === app.stageId)
          return { id: app.id, app, candidate, stage, name: fullName(candidate), appliedAt: new Date(app.appliedAt).getTime(), stageIdx: job.stages.indexOf(stage), rating: app.rating ?? 0 }
        })
        .filter((r) => r.candidate),
    [applications, candidatesById, job],
  )
  const table = useTableState(rows, { initialSort: { key: 'stageIdx', dir: 'desc' }, pageSize: 50 })

  return (
    <Panel bodyClassName="">
      <DataTable
        rows={table.rows}
        sort={table.sort}
        onSort={table.toggleSort}
        onRowClick={(r) => navigate(`/candidates/${r.candidate.id}`)}
        rowLabel={(r) => `Open ${r.name}`}
        empty={<EmptyState icon={Users} title="No applicants yet" description="Applicants appear here as soon as they apply or are added by a recruiter." />}
        columns={[
          {
            key: 'name',
            header: 'Candidate',
            sortable: true,
            render: (r) => (
              <div className="flex items-center gap-3">
                <Avatar name={r.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="truncate text-xs text-muted">{r.candidate.currentTitle}</p>
                </div>
              </div>
            ),
          },
          { key: 'stageIdx', header: 'Stage', sortable: true, render: (r) => <StageBadge app={r.app} stage={r.stage} /> },
          { key: 'experience', header: 'Exp.', hideBelow: 'md', render: (r) => `${r.candidate.experienceYears} yrs` },
          { key: 'rating', header: 'Rating', sortable: true, hideBelow: 'lg', render: (r) => (r.app.rating ? `${r.app.rating}/5` : '—') },
          { key: 'appliedAt', header: 'Applied', sortable: true, hideBelow: 'md', render: (r) => formatRelative(r.app.appliedAt) },
        ]}
        mobileCard={(r) => (
          <div className="flex items-center gap-3">
            <Avatar name={r.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.name}</p>
              <p className="text-xs text-muted">{formatRelative(r.app.appliedAt)}</p>
            </div>
            <StageBadge app={r.app} stage={r.stage} />
          </div>
        )}
      />
    </Panel>
  )
}

export function JobWorkflow({ row }) {
  const templates = useCollection('workflowTemplates')
  const template = templates.find((t) => t.id === row.job.workflowTemplateId)
  const counts = Object.fromEntries(row.byStage.map((s) => [s.id, s.count]))
  return (
    <div className="space-y-6">
      <Panel title="Recruitment workflow" description={template ? `Based on the “${template.name}” template, customised for this vacancy.` : 'Custom workflow'} bodyClassName="px-5 pb-5">
        <WorkflowPreview stages={row.job.stages} counts={counts} />
      </Panel>
      <Panel title="Stage breakdown" description="Active candidates per stage">
        <ul className="divide-y divide-line border-t border-line">
          {row.byStage.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <span className="w-5 text-xs text-faint tabular">{i + 1}</span>
              <span className={`h-2 w-2 rounded-full ${STAGE_TYPES[s.type]?.dot}`} aria-hidden />
              <span className="flex-1 text-sm">{s.name}</span>
              <span className="text-xs text-muted">{STAGE_TYPES[s.type]?.label}</span>
              <span className="w-10 text-right text-sm font-medium tabular">{s.count}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

export function JobActivity({ job }) {
  const applications = useCollection('applications')
  const activities = useCollection('activities')
  const weekly = useMemo(() => {
    const start = startOfWeek(addDays(new Date(), -7 * 7))
    return Array.from({ length: 8 }, (_, i) => {
      const from = addDays(start, i * 7).getTime()
      const to = addDays(start, (i + 1) * 7).getTime()
      const apps = applications.filter((a) => a.jobId === job.id)
      const moves = apps.flatMap((a) => a.history).filter((h) => h.kind !== 'applied')
      return {
        week: formatShortDate(from),
        applications: apps.filter((a) => new Date(a.appliedAt).getTime() >= from && new Date(a.appliedAt).getTime() < to).length,
        moves: moves.filter((h) => new Date(h.at).getTime() >= from && new Date(h.at).getTime() < to).length,
      }
    })
  }, [applications, job.id])
  const items = useMemo(() => activities.filter((a) => a.jobId === job.id), [activities, job.id])

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <Panel title="Weekly activity" description="Applications received and stage moves" className="xl:col-span-3" bodyClassName="px-2 pb-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 8, right: 12, left: -18, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="week" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f3f3f6' }} />
              <Bar dataKey="applications" name="Applications" fill={CHART_COLORS.brand} radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="moves" name="Stage moves" fill={CHART_COLORS.brandSoft} radius={[3, 3, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Hiring activity" className="xl:col-span-2">
        <RecentActivity items={items} limit={10} emptyText="Activity for this vacancy will appear here." />
      </Panel>
    </div>
  )
}
