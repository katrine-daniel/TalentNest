import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { BriefcaseBusiness, ChevronDown, Columns3, MapPin, Pencil, UserPlus } from 'lucide-react'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import Dropdown from '@/components/ui/Dropdown'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { JobActivity, JobApplicants, JobOverview, JobWorkflow } from '@/features/jobs/components/JobDetails'
import { StageDistribution } from '@/features/jobs/components/JobTable'
import { useJobActions, useJobRows } from '@/features/jobs/hooks/useJobs'
import { useGlobalActions } from '@/app/providers/GlobalActionsContext'
import { useSession } from '@/app/providers/SessionContext'
import { toOptions } from '@/utils/statusHelpers'

export default function JobDetailsPage() {
  const { jobId } = useParams()
  const row = useJobRows().find((r) => r.id === jobId)
  const global = useGlobalActions()
  const actions = useJobActions()
  const { can } = useSession()
  const [tab, setTab] = useState('overview')
  const [pendingStatus, setPendingStatus] = useState(null)
  const canManage = can('jobs.manage')

  if (!row) {
    return (
      <EmptyState
        icon={BriefcaseBusiness}
        title="Vacancy not found"
        description="It may have been removed."
        action={<Button to="/jobs">Back to vacancies</Button>}
      />
    )
  }
  const { job } = row

  const changeStatus = (status) => {
    if (status === 'closed') setPendingStatus(status)
    else actions.setStatus.run(job.id, status)
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{job.title}</h1>
            <StatusBadge kind="job" value={job.status} />
          </div>
          <p className="text-muted mt-1 flex flex-wrap items-center gap-x-2 text-sm">
            <span>{row.department?.name}</span>·
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} aria-hidden /> {job.location}
            </span>
            ·<span>{job.openings} openings</span>
          </p>
          <div className="text-muted mt-3 flex items-center gap-3 text-xs">
            <StageDistribution byStage={row.byStage} total={row.active} />
            <span>
              {row.active} active · {row.applicants} total · {row.hired} hired
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dropdown
            menuLabel="Change status"
            items={toOptions('job').map((o) => ({
              key: o.value,
              label: o.label,
              checked: job.status === o.value,
              disabled: job.status === o.value,
              onSelect: () => changeStatus(o.value),
            }))}
            renderTrigger={(props) => (
              <Button {...props} iconRight={ChevronDown} disabled={!canManage} loading={actions.setStatus.pending}>
                Status
              </Button>
            )}
          />
          <Button icon={Pencil} onClick={() => global.openJobForm({ job })} disabled={!canManage}>
            Edit
          </Button>
          <Button icon={UserPlus} onClick={() => global.openCandidateForm({ jobId: job.id })} disabled={!can('candidates.manage') || job.status === 'closed'}>
            Add candidate
          </Button>
          <Button variant="primary" icon={Columns3} to={`/pipeline?job=${job.id}`}>
            Open pipeline
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        label="Vacancy sections"
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'applicants', label: 'Applicants', count: row.applicants },
          { value: 'workflow', label: 'Workflow', count: job.stages.length },
          { value: 'activity', label: 'Hiring activity' },
        ]}
      />
      <div className="pt-5" role="tabpanel">
        {tab === 'overview' && <JobOverview row={row} />}
        {tab === 'applicants' && <JobApplicants job={job} />}
        {tab === 'workflow' && <JobWorkflow row={row} />}
        {tab === 'activity' && <JobActivity job={job} />}
      </div>

      <ConfirmDialog
        open={Boolean(pendingStatus)}
        onClose={() => setPendingStatus(null)}
        title="Close this vacancy?"
        description={`${row.active} active candidates remain in the pipeline. Closing stops new applications; existing candidates stay visible.`}
        confirmLabel="Close vacancy"
        tone="danger"
        loading={actions.setStatus.pending}
        onConfirm={async () => {
          const res = await actions.setStatus.run(job.id, pendingStatus)
          if (res.ok) setPendingStatus(null)
        }}
      />
    </div>
  )
}
