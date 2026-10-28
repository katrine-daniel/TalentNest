import { useCallback, useMemo, useState } from 'react'
import { useCollection, useLookups, fullName } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useSession } from '@/app/providers/SessionContext'
import { pipelineService } from '@/features/pipeline/pipelineService'
import { matchesCandidate } from '@/utils/search'
import { stageRank } from '@/utils/statusHelpers'

const DAY = 86_400_000

/**
 * Board model for one vacancy: its own configurable stages as columns,
 * plus optimistic stage moves so drag-and-drop feels instant.
 */
export function useRecruitmentPipeline(jobId, { query = '', recruiterId = 'all', showRejected = false, sortBy = 'days' } = {}) {
  const applications = useCollection('applications')
  const interviews = useCollection('interviews')
  const assessments = useCollection('assessments')
  const { jobsById, candidatesById, usersById } = useLookups()
  const { actorId } = useSession()
  const [overrides, setOverrides] = useState({})
  const job = jobsById.get(jobId)

  const cards = useMemo(() => {
    if (!job) return []
    const now = Date.now()
    return applications
      .filter((a) => a.jobId === jobId && a.status !== 'withdrawn' && (showRejected || a.status !== 'rejected'))
      .map((app) => {
        const candidate = candidatesById.get(app.candidateId)
        const stageId = overrides[app.id] ?? app.stageId
        const enteredAt = [...app.history].reverse().find((h) => h.toStageId === app.stageId && h.kind !== 'rejected')?.at ?? app.appliedAt
        const appInterviews = interviews.filter((i) => i.applicationId === app.id)
        const next = appInterviews.filter((i) => i.status === 'scheduled' && new Date(i.start).getTime() > now).sort((a, b) => new Date(a.start) - new Date(b.start))[0]
        return {
          id: app.id,
          app,
          stageId,
          candidate,
          name: fullName(candidate),
          recruiter: usersById.get(candidate?.recruiterId),
          daysInStage: Math.max(0, Math.floor((now - new Date(enteredAt).getTime()) / DAY)),
          nextInterview: next ?? null,
          pendingFeedback: appInterviews.some((i) => i.status === 'completed' && !i.feedback),
          openAssessment: assessments.find((x) => x.applicationId === app.id && ['pending', 'in-progress', 'submitted'].includes(x.status)) ?? null,
        }
      })
      .filter((c) => c.candidate && matchesCandidate(c.candidate, query) && (recruiterId === 'all' || c.candidate.recruiterId === recruiterId))
  }, [job, jobId, applications, interviews, assessments, candidatesById, usersById, overrides, query, recruiterId, showRejected])

  const columns = useMemo(() => {
    if (!job) return []
    const sorter =
      sortBy === 'name' ? (a, b) => a.name.localeCompare(b.name) : sortBy === 'rating' ? (a, b) => (b.app.rating ?? 0) - (a.app.rating ?? 0) : (a, b) => b.daysInStage - a.daysInStage
    return job.stages.map((stage) => {
      const list = cards.filter((c) => c.stageId === stage.id).sort(sorter)
      return { stage, cards: list, count: list.length }
    })
  }, [job, cards, sortBy])

  const transitions = useMemo(() => {
    if (!job) return []
    const stageName = (id) => job.stages.find((s) => s.id === id)?.name ?? 'Unknown stage'
    return applications
      .filter((a) => a.jobId === jobId)
      .flatMap((a) =>
        a.history
          .filter((h) => h.kind !== 'applied')
          .map((h) => ({ ...h, candidate: candidatesById.get(a.candidateId), from: h.fromStageId ? stageName(h.fromStageId) : null, to: stageName(h.toStageId), by: usersById.get(h.byId) })),
      )
      .sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [job, jobId, applications, candidatesById, usersById])

  const moveAction = useAsyncAction((appId, stageId, note) => pipelineService.moveStage(appId, stageId, { actorId, note }), {
    success: (app) => `Moved to ${job?.stages.find((s) => s.id === app.stageId)?.name}`,
  })
  const rejectAction = useAsyncAction((appId, reason) => pipelineService.reject(appId, { actorId, reason }), { success: 'Application marked as not progressed' })
  const restoreAction = useAsyncAction((appId) => pipelineService.restore(appId, { actorId }), { success: 'Application restored' })

  const runMove = moveAction.run
  const move = useCallback(
    async (appId, stageId, note = '') => {
      setOverrides((o) => ({ ...o, [appId]: stageId }))
      const res = await runMove(appId, stageId, note)
      setOverrides((o) => {
        const next = { ...o }
        delete next[appId]
        return next
      })
      return res
    },
    [runMove],
  )

  return {
    job,
    columns,
    total: cards.length,
    transitions,
    move,
    reject: rejectAction.run,
    restore: restoreAction.run,
    pending: moveAction.pending || rejectAction.pending || restoreAction.pending,
  }
}

/**
 * Whether a stage move deserves a confirmation step: moving backwards,
 * skipping stages, or entering decision/offer/hired stages.
 */
export function needsConfirmation(job, fromStageId, toStageId) {
  const fromIdx = job.stages.findIndex((s) => s.id === fromStageId)
  const toIdx = job.stages.findIndex((s) => s.id === toStageId)
  const to = job.stages[toIdx]
  if (toIdx < fromIdx) return 'backward'
  if (['offer', 'hired', 'decision'].includes(to.type)) return 'important'
  if (toIdx - fromIdx > 1) return 'skip'
  if (stageRank(to.type) >= 5) return 'important'
  return null
}
