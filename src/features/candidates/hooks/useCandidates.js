import { useMemo } from 'react'
import { useCollection, useLookups, fullName } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useSession } from '@/app/providers/SessionContext'
import { candidateService } from '@/features/candidates/candidateService'
import { pipelineService } from '@/features/pipeline/pipelineService'
import { matchesCandidate } from '@/utils/search'
import { STAGE_TYPES, stageRank } from '@/utils/statusHelpers'

export const EXPERIENCE_BUCKETS = [
  { value: '0-1', label: '0–1 years', min: 0, max: 1 },
  { value: '2-4', label: '2–4 years', min: 2, max: 4 },
  { value: '5-8', label: '5–8 years', min: 5, max: 8 },
  { value: '9+', label: '9+ years', min: 9, max: 99 },
]

export const STATUS_FILTERS = [
  ...Object.entries(STAGE_TYPES).map(([value, meta]) => ({ value, label: meta.label })),
  { value: 'rejected', label: 'Not progressed' },
]

export const CANDIDATE_FILTER_DEFAULTS = { q: '', department: 'all', job: 'all', recruiter: 'all', experience: 'all', status: 'all', view: 'table' }

/** Candidates joined with their applications, jobs and current stages. */
export function useCandidateRows() {
  const candidates = useCollection('candidates')
  const applications = useCollection('applications')
  const { jobsById, usersById } = useLookups()

  return useMemo(() => {
    const byCandidate = new Map()
    applications.forEach((app) => {
      const job = jobsById.get(app.jobId)
      if (!job) return
      const stage = job.stages.find((s) => s.id === app.stageId)
      const list = byCandidate.get(app.candidateId) ?? []
      list.push({ app, job, stage })
      byCandidate.set(app.candidateId, list)
    })
    return candidates.map((candidate) => {
      const apps = (byCandidate.get(candidate.id) ?? []).sort((a, b) => new Date(b.app.updatedAt) - new Date(a.app.updatedAt))
      const primary = apps.find((a) => a.app.status === 'active') ?? apps[0] ?? null
      return {
        id: candidate.id,
        candidate,
        name: fullName(candidate),
        apps,
        primary,
        recruiter: usersById.get(candidate.recruiterId),
        appliedAt: primary?.app.appliedAt ?? candidate.createdAt,
        stageRank: primary ? (primary.app.status === 'rejected' ? -1 : stageRank(primary.stage?.type)) : -2,
      }
    })
  }, [candidates, applications, jobsById, usersById])
}

export function filterCandidateRows(rows, f) {
  const bucket = EXPERIENCE_BUCKETS.find((b) => b.value === f.experience)
  return rows.filter((row) => {
    const { candidate, apps } = row
    if (!matchesCandidate(candidate, f.q)) return false
    if (f.department !== 'all' && !apps.some((a) => a.job.departmentId === f.department)) return false
    if (f.job !== 'all' && !apps.some((a) => a.job.id === f.job)) return false
    if (f.recruiter !== 'all' && candidate.recruiterId !== f.recruiter) return false
    if (bucket && (candidate.experienceYears < bucket.min || candidate.experienceYears > bucket.max)) return false
    if (f.status !== 'all') {
      if (f.status === 'rejected') return apps.some((a) => a.app.status === 'rejected')
      return apps.some((a) => a.app.status !== 'rejected' && a.stage?.type === f.status)
    }
    return true
  })
}

export function useCandidates(filters) {
  const rows = useCandidateRows()
  const filtered = useMemo(() => filterCandidateRows(rows, filters), [rows, filters])
  return { rows: filtered, total: rows.length }
}

/** Everything the candidate profile needs, grouped per application. */
export function useCandidateDetails(candidateId) {
  const candidates = useCollection('candidates')
  const applications = useCollection('applications')
  const interviews = useCollection('interviews')
  const assessments = useCollection('assessments')
  const offers = useCollection('offers')
  const activities = useCollection('activities')
  const { jobsById } = useLookups()

  return useMemo(() => {
    const candidate = candidates.find((c) => c.id === candidateId)
    if (!candidate) return null
    const apps = applications
      .filter((a) => a.candidateId === candidateId)
      .map((app) => {
        const job = jobsById.get(app.jobId)
        return {
          app,
          job,
          stage: job?.stages.find((s) => s.id === app.stageId),
          interviews: interviews.filter((i) => i.applicationId === app.id).sort((a, b) => new Date(b.start) - new Date(a.start)),
          assessments: assessments.filter((x) => x.applicationId === app.id),
          offer: offers.find((o) => o.applicationId === app.id && o.status !== 'declined') ?? offers.find((o) => o.applicationId === app.id),
        }
      })
      .filter((a) => a.job)
      .sort((a, b) => new Date(b.app.updatedAt) - new Date(a.app.updatedAt))
    return {
      candidate,
      apps,
      interviews: apps.flatMap((a) => a.interviews),
      assessments: apps.flatMap((a) => a.assessments),
      activities: activities.filter((x) => x.candidateId === candidateId),
    }
  }, [candidateId, candidates, applications, interviews, assessments, offers, activities, jobsById])
}

export function useCandidateActions() {
  const { actorId } = useSession()
  const ctx = { actorId }
  return {
    create: useAsyncAction((values) => candidateService.create(values, ctx), { success: (c) => `${c.firstName} ${c.lastName} added to candidates` }),
    update: useAsyncAction((id, patch) => candidateService.update(id, patch, ctx), { success: 'Candidate profile saved' }),
    addNote: useAsyncAction((id, text) => candidateService.addNote(id, text, ctx), { success: 'Note added' }),
    attachResume: useAsyncAction((id, file) => candidateService.attachResume(id, file, ctx), { success: 'Resume uploaded (demo — file metadata only)' }),
    addApplication: useAsyncAction((id, jobId) => candidateService.addApplication(id, jobId, ctx), { success: 'Candidate added to vacancy' }),
    moveStage: useAsyncAction((appId, stageId, note) => pipelineService.moveStage(appId, stageId, { ...ctx, note }), { success: 'Stage updated' }),
    reject: useAsyncAction((appId, reason) => pipelineService.reject(appId, { ...ctx, reason }), { success: 'Application marked as not progressed' }),
    restore: useAsyncAction((appId) => pipelineService.restore(appId, ctx), { success: 'Application restored' }),
    rate: useAsyncAction((appId, rating) => pipelineService.rate(appId, rating)),
  }
}
