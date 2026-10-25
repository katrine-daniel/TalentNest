import { useMemo, useState } from 'react'
import { History, Pencil, UserPlus } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import SearchInput from '@/components/ui/SearchInput'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Checkbox, FilterSelect, Select } from '@/components/ui/FormControls'
import Avatar from '@/components/ui/Avatar'
import PipelineBoard from '@/components/pipeline/PipelineBoard'
import StageChangeDialog from '@/components/pipeline/StageChangeDialog'
import { WorkflowPreview } from '@/components/jobs/WorkflowBuilder'
import CandidateDrawer from '@/components/candidates/CandidateDrawer'
import { useRecruitmentPipeline } from '@/hooks/useRecruitmentPipeline'
import { useStageMove } from '@/hooks/useStageMove'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import { useCollection, fullName } from '@/hooks/useStore'
import { useOrgOptions } from '@/hooks/useJobs'
import { useGlobalActions } from '@/context/GlobalActionsContext'
import { useSession } from '@/context/SessionContext'
import { formatRelative } from '@/utils/formatDate'

const DEFAULTS = { job: '', q: '', recruiter: 'all', rejected: 'hide', sort: 'days' }

export default function PipelinePage() {
  const jobs = useCollection('jobs')
  const applications = useCollection('applications')
  const options = useOrgOptions()
  const global = useGlobalActions()
  const { can } = useSession()
  const canMove = can('pipeline.move')
  const { filters, setFilter } = useUrlFilters(DEFAULTS)

  const jobOptions = useMemo(
    () =>
      jobs
        .filter((j) => j.status !== 'draft')
        .map((j) => ({ value: j.id, label: `${j.title} (${applications.filter((a) => a.jobId === j.id && a.status === 'active').length})${j.status !== 'open' ? ` — ${j.status.replace('-', ' ')}` : ''}` })),
    [jobs, applications],
  )
  const jobId = filters.job || jobs.find((j) => j.status === 'open')?.id || jobOptions[0]?.value

  const pipeline = useRecruitmentPipeline(jobId, { query: filters.q, recruiterId: filters.recruiter, showRejected: filters.rejected === 'show', sortBy: filters.sort })
  const stageMove = useStageMove(pipeline.move)
  const [drawerCard, setDrawerCard] = useState(null)
  const [rejectCard, setRejectCard] = useState(null)
  const [activityOpen, setActivityOpen] = useState(false)

  const requestMove = (card, toStageId) => stageMove.request({ app: { ...card.app, stageId: card.stageId }, job: pipeline.job, toStageId, candidateName: card.name })

  if (!pipeline.job) {
    return <EmptyState title="No vacancies to show" description="Create a vacancy to start building its pipeline." action={<Button variant="primary" onClick={() => global.openJobForm()}>New vacancy</Button>} />
  }

  return (
    <div>
      <PageHeader
        title="Recruitment Pipeline"
        description="Drag candidates between stages. Each vacancy follows its own workflow."
        actions={
          <>
            <Button icon={History} onClick={() => setActivityOpen(true)}>
              Stage history
            </Button>
            <Button icon={Pencil} onClick={() => global.openJobForm({ job: pipeline.job })} disabled={!can('jobs.manage')}>
              Edit workflow
            </Button>
            <Button variant="primary" icon={UserPlus} onClick={() => global.openCandidateForm({ jobId })} disabled={!can('candidates.manage') || pipeline.job.status === 'closed'}>
              Add candidate
            </Button>
          </>
        }
      />

      <div className="mb-4 space-y-3 rounded-2xl border border-line/80 bg-surface shadow-card p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Select aria-label="Vacancy" value={jobId} onChange={(e) => setFilter('job', e.target.value)} options={jobOptions} />
          <SearchInput value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search name, skill or ID" label="Search pipeline" />
          <FilterSelect label="Recruiter" value={filters.recruiter} onChange={(v) => setFilter('recruiter', v)} options={options.recruiters} />
          <FilterSelect
            label="Sort"
            value={filters.sort === 'days' ? 'all' : filters.sort}
            onChange={(v) => setFilter('sort', v === 'all' ? 'days' : v)}
            allLabel="Longest in stage"
            options={[
              { value: 'rating', label: 'Highest rated' },
              { value: 'name', label: 'Name' },
            ]}
          />
          <div className="flex items-center px-1">
            <Checkbox label="Show not progressed" checked={filters.rejected === 'show'} onChange={(e) => setFilter('rejected', e.target.checked ? 'show' : 'hide')} />
          </div>
        </div>
        <div className="no-scrollbar overflow-x-auto">
          <WorkflowPreview stages={pipeline.job.stages} counts={Object.fromEntries(pipeline.columns.map((c) => [c.stage.id, c.count]))} />
        </div>
      </div>

      {!canMove && <p className="mb-3 text-xs text-muted">Your role can view the pipeline but not move candidates.</p>}

      <PipelineBoard
        columns={pipeline.columns}
        canMove={canMove}
        onDrop={requestMove}
        onMove={requestMove}
        onOpen={(card) => setDrawerCard(card)}
        onReject={(card) => setRejectCard(card)}
        onRestore={(card) => pipeline.restore(card.id)}
      />

      <StageChangeDialog change={stageMove.change} job={pipeline.job} onClose={stageMove.cancel} onConfirm={stageMove.confirm} loading={stageMove.pending} />

      <ConfirmDialog
        open={Boolean(rejectCard)}
        onClose={() => setRejectCard(null)}
        title={`Mark ${rejectCard?.name ?? ''} as not progressing?`}
        description="The application leaves the active pipeline and can be restored later. No message is sent to the candidate."
        confirmLabel="Confirm"
        tone="danger"
        reasonLabel="Reason"
        requireReason
        loading={pipeline.pending}
        onConfirm={async (reason) => {
          const res = await pipeline.reject(rejectCard.id, reason)
          if (res.ok) setRejectCard(null)
        }}
      />

      <CandidateDrawer candidateId={drawerCard?.candidate.id} focusApplicationId={drawerCard?.id} open={Boolean(drawerCard)} onClose={() => setDrawerCard(null)} moveFn={pipeline.move} />

      <Drawer open={activityOpen} onClose={() => setActivityOpen(false)} title="Stage history" subtitle={pipeline.job.title} size="md">
        {pipeline.transitions.length ? (
          <ol className="divide-y divide-line">
            {pipeline.transitions.slice(0, 80).map((t) => (
              <li key={t.id} className="flex gap-3 px-5 py-3">
                <Avatar name={fullName(t.candidate)} size="sm" />
                <div className="min-w-0 text-sm">
                  <p>
                    <span className="font-medium">{fullName(t.candidate)}</span>{' '}
                    {t.kind === 'rejected' ? (
                      <span className="text-red-600">not progressed at {t.to}</span>
                    ) : t.kind === 'restored' ? (
                      <>restored at {t.to}</>
                    ) : (
                      <>
                        {t.from} → <strong className="font-medium">{t.to}</strong>
                      </>
                    )}
                  </p>
                  {t.note && <p className="text-xs text-ink-soft">“{t.note}”</p>}
                  <p className="text-xs text-muted">
                    {formatRelative(t.at)}
                    {t.by && ` · ${t.by.name}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState compact title="No stage changes yet" />
        )}
      </Drawer>
    </div>
  )
}
