import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarPlus, ChevronDown, CircleSlash, ClipboardCheck, FileSignature, History, MoveRight, RotateCcw, Star } from 'lucide-react'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import StatusBadge from '@/components/ui/StatusBadge'
import StageBadge from './StageBadge'
import CandidateTimeline from './CandidateTimeline'
import { useCandidateActions } from '@/features/candidates/hooks/useCandidates'
import { useGlobalActions } from '@/app/providers/GlobalActionsContext'
import { useSession } from '@/app/providers/SessionContext'
import { useCollection, useLookups } from '@/hooks/useStore'
import { feedbackCompletion, panelConsensus } from '@/features/interviews/feedbackSelectors'
import { formatDate, formatDateTime } from '@/utils/formatDate'
import { STAGE_TYPES } from '@/utils/statusHelpers'
import { cn } from '@/utils/cn'

function StageProgress({ job, app }) {
  const current = job.stages.findIndex((s) => s.id === app.stageId)
  return (
    <div className="flex gap-1" aria-label={`Stage ${current + 1} of ${job.stages.length}`} role="img">
      {job.stages.map((s, i) => (
        <span
          key={s.id}
          title={s.name}
          className={cn(
            'h-1.5 flex-1 rounded-full',
            i < current && (app.status === 'rejected' ? 'bg-gray-300' : 'bg-brand-300'),
            i === current && (app.status === 'rejected' ? 'bg-red-400' : app.status === 'hired' ? 'bg-emerald-500' : 'bg-brand-600'),
            i > current && 'bg-subtle',
          )}
        />
      ))}
    </div>
  )
}

/**
 * One application (candidate × vacancy) with its own stage, actions,
 * interviews, assessments, offer and stage history.
 */
export default function ApplicationCard({ entry, candidateName, onRequestMove, defaultExpanded = false }) {
  const { app, job, stage, interviews = [], assessments = [], offer } = entry
  const { can } = useSession()
  const { templatesById, usersById } = useLookups()
  const allFeedback = useCollection('interviewFeedback')
  const global = useGlobalActions()
  const actions = useCandidateActions()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [rejecting, setRejecting] = useState(false)
  const active = app.status === 'active'
  const canMove = can('pipeline.move')

  const moveItems = job.stages.map((s) => ({
    key: s.id,
    label: s.name,
    checked: s.id === app.stageId,
    disabled: s.id === app.stageId,
    onSelect: () => onRequestMove({ app, job, toStageId: s.id, candidateName }),
  }))

  return (
    <article className="border-line/80 bg-surface shadow-card rounded-2xl border">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/jobs/${job.id}`} className="text-ink hover:text-brand-700 font-medium hover:underline">
              {job.title}
            </Link>
            <p className="text-muted text-xs">
              Applied {formatDate(app.appliedAt)} · {job.location}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {app.rating && (
              <span className="flex items-center gap-0.5 text-xs text-amber-600" title="Recruiter rating">
                <Star size={12} className="fill-current" aria-hidden /> {app.rating}/5
              </span>
            )}
            <StageBadge app={app} stage={stage} />
          </div>
        </div>
        <StageProgress job={job} app={app} />

        <div className="flex flex-wrap gap-2">
          {active && (
            <Dropdown
              items={[{ heading: 'Move to stage' }, ...moveItems]}
              align="start"
              className="w-60"
              menuLabel="Move to stage"
              renderTrigger={(props) => (
                <Button {...props} size="sm" variant="primary" icon={MoveRight} disabled={!canMove}>
                  Move stage
                </Button>
              )}
            />
          )}
          {active && (
            <Dropdown
              align="start"
              menuLabel="Schedule"
              items={[
                {
                  label: 'Schedule interview',
                  icon: CalendarPlus,
                  disabled: !can('interviews.schedule'),
                  onSelect: () => global.openSchedule({ applicationId: app.id }),
                },
                {
                  label: 'Assign assessment',
                  icon: ClipboardCheck,
                  disabled: !can('interviews.schedule'),
                  onSelect: () => global.openAssessment({ applicationId: app.id }),
                },
                {
                  label: 'Create offer',
                  icon: FileSignature,
                  disabled: !can('offers.manage') || Boolean(offer && offer.status !== 'declined'),
                  onSelect: () => global.openOffer({ applicationId: app.id }),
                },
              ]}
              renderTrigger={(props) => (
                <Button {...props} size="sm" iconRight={ChevronDown}>
                  Actions
                </Button>
              )}
            />
          )}
          {active && (
            <Button size="sm" variant="danger-ghost" icon={CircleSlash} onClick={() => setRejecting(true)} disabled={!canMove}>
              Not progressing
            </Button>
          )}
          {app.status === 'rejected' && (
            <Button size="sm" icon={RotateCcw} loading={actions.restore.pending} onClick={() => actions.restore.run(app.id)} disabled={!canMove}>
              Restore to pipeline
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={History} onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} className="ml-auto">
            {expanded ? 'Hide history' : 'History'}
          </Button>
        </div>
      </div>

      {(interviews.length > 0 || assessments.length > 0 || offer) && (
        <ul className="divide-line border-line divide-y border-t text-sm">
          {interviews.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', STAGE_TYPES.interview.dot)} aria-hidden />
              <Link to={`/calendar?event=${i.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {i.stageName}
                <span className="text-muted"> · {formatDateTime(i.start)}</span>
              </Link>
              <span className="text-muted text-xs">
                {i.interviewerIds
                  .map((id) => usersById.get(id)?.name)
                  .filter(Boolean)
                  .join(', ')}
              </span>
              {i.status === 'completed' ? (
                (() => {
                  const completion = feedbackCompletion(i, allFeedback)
                  const consensus = panelConsensus(allFeedback.filter((f) => f.interviewId === i.id && f.status === 'submitted'))
                  return completion.complete ? (
                    <StatusBadge tone={consensus.tone}>{consensus.label}</StatusBadge>
                  ) : (
                    <StatusBadge tone="amber">
                      Feedback {completion.submitted}/{completion.total}
                    </StatusBadge>
                  )
                })()
              ) : (
                <StatusBadge kind="interview" value={i.status} />
              )}
            </li>
          ))}
          {assessments.map((a) => {
            const t = templatesById.get(a.templateId)
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', STAGE_TYPES.assessment.dot)} aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {t?.name}
                  <span className="text-muted"> · due {formatDate(a.deadline)}</span>
                </span>
                {a.score != null ? (
                  <StatusBadge tone={a.score >= (t?.passMark ?? 60) ? 'green' : 'red'}>
                    {a.score}% {a.score >= (t?.passMark ?? 60) ? 'pass' : 'below pass mark'}
                  </StatusBadge>
                ) : (
                  <StatusBadge kind="assessment" value={a.status} />
                )}
              </li>
            )
          })}
          {offer && (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', STAGE_TYPES.offer.dot)} aria-hidden />
              <Link to="/offers" className="min-w-0 flex-1 truncate hover:underline">
                Offer · ₹{offer.salary.toLocaleString('en-IN')} per annum
              </Link>
              <StatusBadge kind="offer" value={offer.status} />
            </li>
          )}
        </ul>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-line bg-subtle/40 border-t p-4">
              <CandidateTimeline app={app} job={job} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Mark as not progressing?"
        description={`${candidateName} will be removed from the active pipeline for ${job.title}. You can restore the application later. No message is sent to the candidate.`}
        confirmLabel="Confirm"
        tone="danger"
        reasonLabel="Reason"
        requireReason
        reasonPlaceholder="e.g. Assessment score below pass mark"
        loading={actions.reject.pending}
        onConfirm={async (reason) => {
          const res = await actions.reject.run(app.id, reason)
          if (res.ok) setRejecting(false)
        }}
      />
    </article>
  )
}
