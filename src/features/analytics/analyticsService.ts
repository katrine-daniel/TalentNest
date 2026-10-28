/**
 * Reporting selectors computed only from recorded data — no historical or
 * synthetic figures. Every rate returns `null` when its denominator is zero, so
 * the UI shows "—" instead of a misleading 0%. Formulas are listed in METRIC_DEFINITIONS.
 */
import { stageRank } from '@/utils/statusHelpers'
import { isAssessmentOverdue } from '@/features/assessments/assessmentService'
import { feedbackCompletion, POSITIVE } from '@/features/interviews/feedbackSelectors'
import type { Application, Database, Job, StageType } from '@/types/domain'

const DAY = 86_400_000

export interface Filters {
  departmentId?: string
  /** Only applications received in the last N days (by appliedAt). */
  sinceDays?: number | null
}

type Data = Pick<
  Database,
  'jobs' | 'candidates' | 'users' | 'departments' | 'assessmentTemplates' | 'applications' | 'interviews' | 'interviewFeedback' | 'assessments' | 'offers'
>

export const METRIC_DEFINITIONS: Record<string, string> = {
  applications: 'Applications received in the selected period (by application date).',
  applicationToInterview: 'Applications in the period that reached an interview stage ÷ applications in the period.',
  funnel: 'For each step, applications in the period whose furthest stage reached at least that step. Conversion = this step ÷ previous step.',
  timeToHire: 'Days from application date to the date the application entered the Hired stage, averaged over hires with both dates recorded.',
  offerAcceptance: 'Accepted offers ÷ (accepted + declined offers). Offers still awaiting a response are excluded.',
  passRate: 'Evaluated assessments scoring at or above the template pass mark ÷ evaluated assessments.',
  interviewToOffer: 'Applications that reached an offer stage ÷ applications that reached an interview stage (same period).',
  feedbackCompletion: 'Completed interviews where every panelist submitted a scorecard ÷ completed interviews.',
  sourceEffectiveness: 'Per candidate source: share of applications reaching interview, and share hired.',
}

export const rate = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 100) : null)

export function indexData(data: Pick<Data, 'jobs' | 'candidates' | 'users' | 'departments' | 'assessmentTemplates'>) {
  const jobsById = new Map(data.jobs.map((j) => [j.id, j]))
  const candidatesById = new Map(data.candidates.map((c) => [c.id, c]))
  const usersById = new Map(data.users.map((u) => [u.id, u]))
  const departmentsById = new Map(data.departments.map((d) => [d.id, d]))
  const templatesById = new Map(data.assessmentTemplates.map((t) => [t.id, t]))
  const stageOf = (app: Pick<Application, 'jobId' | 'stageId'>) => jobsById.get(app.jobId)?.stages.find((s) => s.id === app.stageId)
  return { jobsById, candidatesById, usersById, departmentsById, templatesById, stageOf }
}

const deptMatch = (job: Job | undefined, departmentId?: string) => !departmentId || departmentId === 'all' || job?.departmentId === departmentId

function inScope(app: Application, jobsById: Map<string, Job>, { departmentId, sinceDays }: Filters = {}, now = Date.now()) {
  const job = jobsById.get(app.jobId)
  if (!job || !deptMatch(job, departmentId)) return false
  if (sinceDays) {
    const applied = new Date(app.appliedAt).getTime()
    // Records without a valid date are excluded from dated metrics rather than guessed.
    if (Number.isNaN(applied) || applied < now - sinceDays * DAY) return false
  }
  return true
}

function maxRankReached(app: Application, job: Job | undefined) {
  return app.history.reduce((max, h) => Math.max(max, stageRank(job?.stages.find((s) => s.id === h.toStageId)?.type as StageType)), 0)
}

export function hiredAt(app: Application): string | null {
  return app.history.find((h) => h.kind === 'hired')?.at ?? null
}

// ------------------------------------------------------------------ dashboard
export function getDashboardMetrics(data: Data, filters: Filters = {}) {
  const { jobsById } = indexData(data)
  const now = Date.now()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deptOk = (jobId: string) => deptMatch(jobsById.get(jobId), filters.departmentId)

  const activeApps = data.applications.filter((a) => a.status === 'active' && inScope(a, jobsById, filters))
  const upcomingInterviews = data.interviews.filter((i) => i.status === 'scheduled' && deptOk(i.jobId) && new Date(i.start).getTime() >= today.getTime())
  const openAssessments = data.assessments.filter((a) => ['pending', 'in-progress', 'submitted'].includes(a.status) && deptOk(a.jobId))
  const awaitingOffers = data.offers.filter((o) => ['sent', 'negotiating'].includes(o.status) && deptOk(o.jobId))
  const attention = getAttentionItems(data, filters)
  const openJobs = data.jobs.filter((j) => j.status === 'open' && deptMatch(j, filters.departmentId))

  return {
    activeCandidates: new Set(activeApps.map((a) => a.candidateId)).size,
    newThisWeek: data.applications.filter((a) => deptOk(a.jobId) && new Date(a.appliedAt).getTime() > now - 7 * DAY).length,
    openVacancies: openJobs.length,
    openings: openJobs.reduce((sum, j) => sum + j.openings, 0),
    interviewsScheduled: upcomingInterviews.length,
    interviewsToday: upcomingInterviews.filter((i) => new Date(i.start).getTime() < today.getTime() + DAY).length,
    assessmentsPending: openAssessments.length,
    overdueAssessments: openAssessments.filter((a) => isAssessmentOverdue(a, now)).length,
    offersAwaiting: awaitingOffers.length,
    expiringOffers: awaitingOffers.filter((o) => new Date(o.expiresAt).getTime() < now + 2 * DAY).length,
    needsAttention: attention.length,
    pendingFeedback: attention.filter((a) => a.kind === 'feedback').length,
  }
}

const FUNNEL_STEPS = [
  { key: 'application', label: 'Applied', rank: 0 },
  { key: 'screening', label: 'Screened', rank: 1 },
  { key: 'assessment', label: 'Assessed', rank: 2 },
  { key: 'interview', label: 'Interviewed', rank: 3 },
  { key: 'offer', label: 'Offered', rank: 5 },
  { key: 'hired', label: 'Hired', rank: 6 },
] as const

export function getFunnel(data: Data, filters: Filters = {}) {
  const { jobsById } = indexData(data)
  const reached = data.applications.filter((a) => inScope(a, jobsById, filters)).map((a) => maxRankReached(a, jobsById.get(a.jobId)))
  return FUNNEL_STEPS.map((step, i) => {
    const count = reached.filter((r) => r >= step.rank).length
    const prevStep = FUNNEL_STEPS[i - 1]
    const prev = prevStep ? reached.filter((r) => r >= prevStep.rank).length : count
    return { ...step, count, conversion: i === 0 ? 100 : (rate(count, prev) ?? 0) }
  })
}

export const BREAKDOWN_GROUPS = [
  { key: 'early', label: 'Applied & screening', types: ['application', 'screening'] },
  { key: 'assessment', label: 'Assessment', types: ['assessment'] },
  { key: 'interview', label: 'Interviews', types: ['interview'] },
  { key: 'late', label: 'Decision & offer', types: ['decision', 'offer'] },
] as const

export function getDepartmentBreakdown(data: Data, filters: Filters = {}) {
  const { jobsById, stageOf } = indexData(data)
  return data.departments
    .map((dept) => {
      const apps = data.applications.filter(
        (a) => a.status === 'active' && jobsById.get(a.jobId)?.departmentId === dept.id && inScope(a, jobsById, { sinceDays: filters.sinceDays }),
      )
      const row: Record<string, string | number> = { departmentId: dept.id, name: dept.name, short: dept.code, total: apps.length }
      BREAKDOWN_GROUPS.forEach((g) => {
        row[g.key] = apps.filter((a) => (g.types as readonly string[]).includes(stageOf(a)?.type ?? '')).length
      })
      row.hired = data.applications.filter((a) => a.status === 'hired' && jobsById.get(a.jobId)?.departmentId === dept.id).length
      row.openings = data.jobs.filter((j) => j.departmentId === dept.id && j.status === 'open').reduce((s, j) => s + j.openings, 0)
      return row
    })
    .filter((r) => Number(r.total) > 0 || Number(r.openings) > 0)
}

export interface AttentionItem {
  id: string
  kind: 'feedback' | 'assessment' | 'review' | 'offer' | 'stale'
  title: string
  subtitle: string
  due: string
  overdue: boolean
  link: string
}

export function getAttentionItems(data: Data, filters: Filters = {}): AttentionItem[] {
  const { jobsById, candidatesById, stageOf } = indexData(data)
  const now = Date.now()
  const deptOk = (jobId: string) => deptMatch(jobsById.get(jobId), filters.departmentId)
  const name = (id: string) => {
    const c = candidatesById.get(id)
    return c ? `${c.firstName} ${c.lastName}` : 'Candidate'
  }
  const items: AttentionItem[] = []

  data.interviews
    .filter((i) => i.status === 'completed' && deptOk(i.jobId))
    .forEach((i) => {
      const completion = feedbackCompletion(i, data.interviewFeedback)
      if (completion.complete) return
      items.push({
        id: `fb-${i.id}`,
        kind: 'feedback',
        title: `Feedback pending — ${name(i.candidateId)}`,
        subtitle: `${i.stageName} · ${completion.submitted}/${completion.total} scorecards · ${jobsById.get(i.jobId)?.title ?? ''}`,
        due: i.start,
        overdue: now - new Date(i.start).getTime() > DAY,
        link: `/calendar?event=${i.id}`,
      })
    })

  data.assessments
    .filter((a) => deptOk(a.jobId) && (isAssessmentOverdue(a, now) || a.status === 'submitted'))
    .forEach((a) =>
      items.push({
        id: `as-${a.id}`,
        kind: a.status === 'submitted' ? 'review' : 'assessment',
        title: a.status === 'submitted' ? `Review assessment — ${name(a.candidateId)}` : `Assessment overdue — ${name(a.candidateId)}`,
        subtitle: jobsById.get(a.jobId)?.title ?? '',
        due: (a.status === 'submitted' ? a.completedAt : a.deadline) ?? a.deadline,
        overdue: a.status !== 'submitted',
        link: `/assessments?status=${a.status === 'submitted' ? 'submitted' : 'overdue'}`,
      }),
    )

  data.offers
    .filter((o) => ['sent', 'negotiating'].includes(o.status) && deptOk(o.jobId) && new Date(o.expiresAt).getTime() < now + 2 * DAY)
    .forEach((o) =>
      items.push({
        id: `of-${o.id}`,
        kind: 'offer',
        title: `Offer expiring — ${name(o.candidateId)}`,
        subtitle: jobsById.get(o.jobId)?.title ?? '',
        due: o.expiresAt,
        overdue: new Date(o.expiresAt).getTime() < now,
        link: '/offers',
      }),
    )

  data.applications
    .filter(
      (a) =>
        a.status === 'active' &&
        deptOk(a.jobId) &&
        ['application', 'screening'].includes(stageOf(a)?.type ?? '') &&
        now - new Date(a.updatedAt).getTime() > 6 * DAY,
    )
    .forEach((a) =>
      items.push({
        id: `st-${a.id}`,
        kind: 'stale',
        title: `No movement in ${Math.round((now - new Date(a.updatedAt).getTime()) / DAY)} days — ${name(a.candidateId)}`,
        subtitle: `${stageOf(a)?.name ?? ''} · ${jobsById.get(a.jobId)?.title ?? ''}`,
        due: a.updatedAt,
        overdue: false,
        link: `/candidates/${a.candidateId}`,
      }),
    )

  const order = { feedback: 0, assessment: 1, offer: 2, review: 3, stale: 4 }
  return items.sort((a, b) => order[a.kind] - order[b.kind] || new Date(a.due).getTime() - new Date(b.due).getTime())
}

export function getUpcomingSchedule(data: Data, { departmentId, days = 7 }: { departmentId?: string; days?: number } = {}) {
  const { jobsById } = indexData(data)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = start.getTime() + days * DAY
  const deptOk = (jobId: string) => deptMatch(jobsById.get(jobId), departmentId)
  const within = (iso: string) => new Date(iso).getTime() >= start.getTime() && new Date(iso).getTime() < end
  const interviews = data.interviews
    .filter((i) => i.status === 'scheduled' && deptOk(i.jobId) && within(i.start))
    .map((i) => ({ kind: 'interview' as const, id: i.id, at: i.start, item: i }))
  const assessments = data.assessments
    .filter((a) => ['pending', 'in-progress'].includes(a.status) && deptOk(a.jobId) && within(a.deadline))
    .map((a) => ({ kind: 'assessment' as const, id: a.id, at: a.deadline, item: a }))
  return [...interviews, ...assessments].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

// ------------------------------------------------------------------ analytics
/** Weekly or monthly counts of applications, interviews held and hires, from recorded dates. */
export function getActivitySeries(
  data: Data,
  { granularity = 'week', periods = 12, departmentId }: { granularity?: 'week' | 'month'; periods?: number; departmentId?: string } = {},
) {
  const { jobsById } = indexData(data)
  const now = new Date()
  const buckets = Array.from({ length: periods }, (_, i) => {
    const offset = periods - 1 - i
    let from: Date
    let to: Date
    if (granularity === 'month') {
      from = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1)
    } else {
      const startOfThisWeek = new Date(now)
      startOfThisWeek.setHours(0, 0, 0, 0)
      startOfThisWeek.setDate(startOfThisWeek.getDate() - ((startOfThisWeek.getDay() + 6) % 7))
      from = new Date(startOfThisWeek.getTime() - offset * 7 * DAY)
      to = new Date(from.getTime() + 7 * DAY)
    }
    const label =
      granularity === 'month'
        ? from.toLocaleDateString('en-GB', { month: 'short', year: from.getMonth() === 0 ? '2-digit' : undefined })
        : offset === 0
          ? 'This wk'
          : from.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return { key: from.toISOString(), label, from: from.getTime(), to: to.getTime(), applications: 0, interviews: 0, hires: 0 }
  })
  const add = (iso: string | null, field: 'applications' | 'interviews' | 'hires') => {
    if (!iso) return
    const t = new Date(iso).getTime()
    const b = buckets.find((x) => t >= x.from && t < x.to)
    if (b) b[field] += 1
  }
  const deptOk = (jobId: string) => deptMatch(jobsById.get(jobId), departmentId)
  data.applications
    .filter((a) => deptOk(a.jobId))
    .forEach((a) => {
      add(a.appliedAt, 'applications')
      add(hiredAt(a), 'hires')
    })
  data.interviews.filter((i) => i.status === 'completed' && deptOk(i.jobId)).forEach((i) => add(i.start, 'interviews'))
  return buckets.map(({ key, label, applications, interviews, hires }) => ({ key, label, applications, interviews, hires }))
}

export function getAssessmentPassRates(data: Data, filters: Filters = {}) {
  const { jobsById } = indexData(data)
  return data.assessmentTemplates
    .map((t) => {
      const evaluated = data.assessments.filter(
        (a) => a.templateId === t.id && a.status === 'evaluated' && a.score !== null && deptMatch(jobsById.get(a.jobId), filters.departmentId),
      )
      const passed = evaluated.filter((a) => (a.score ?? 0) >= t.passMark).length
      return {
        id: t.id,
        name: t.name.replace(' Assessment', '').replace(' — Web Stack', ''),
        evaluated: evaluated.length,
        passed,
        rate: rate(passed, evaluated.length) ?? 0,
        passMark: t.passMark,
      }
    })
    .filter((r) => r.evaluated > 0)
}

/** Share of submitted scorecards recommending to advance, per interview round. */
export function getInterviewConversion(data: Data, filters: Filters = {}) {
  const { jobsById } = indexData(data)
  const interviewsById = new Map(data.interviews.map((i) => [i.id, i]))
  const buckets = new Map<string, { stage: string; completed: number; advanced: number }>()
  data.interviewFeedback
    .filter((f) => f.status === 'submitted')
    .forEach((f) => {
      const i = interviewsById.get(f.interviewId)
      if (!i || !deptMatch(jobsById.get(i.jobId), filters.departmentId)) return
      const b = buckets.get(i.stageName) ?? { stage: i.stageName, completed: 0, advanced: 0 }
      b.completed += 1
      if (f.recommendation && POSITIVE.includes(f.recommendation)) b.advanced += 1
      buckets.set(i.stageName, b)
    })
  return [...buckets.values()].map((b) => ({ ...b, rate: rate(b.advanced, b.completed) ?? 0 })).sort((a, b) => b.completed - a.completed)
}

export function getInterviewCompletion(data: Data, filters: Filters = {}) {
  const { jobsById } = indexData(data)
  const completed = data.interviews.filter((i) => i.status === 'completed' && deptMatch(jobsById.get(i.jobId), filters.departmentId))
  const withAllFeedback = completed.filter((i) => feedbackCompletion(i, data.interviewFeedback).complete).length
  const overdue = completed.filter((i) => !feedbackCompletion(i, data.interviewFeedback).complete && Date.now() - new Date(i.start).getTime() > DAY).length
  return { completed: completed.length, withAllFeedback, overdue, rate: rate(withAllFeedback, completed.length) }
}

/** Average days application → hire per department; departments without hires report null (no estimate). */
export function getTimeToHire(data: Data) {
  const { jobsById } = indexData(data)
  const hired = data.applications.filter((a) => a.status === 'hired' && hiredAt(a))
  return data.departments.map((d) => {
    const days = hired
      .filter((a) => jobsById.get(a.jobId)?.departmentId === d.id)
      .map((a) => (new Date(hiredAt(a) as string).getTime() - new Date(a.appliedAt).getTime()) / DAY)
    return {
      departmentId: d.id,
      name: d.name,
      short: d.code,
      hires: days.length,
      days: days.length ? Math.round(days.reduce((s, x) => s + x, 0) / days.length) : null,
    }
  })
}

export function getOverallTimeToHire(data: Data, filters: Filters = {}) {
  const { jobsById } = indexData(data)
  const days = data.applications
    .filter((a) => a.status === 'hired' && hiredAt(a) && deptMatch(jobsById.get(a.jobId), filters.departmentId))
    .map((a) => (new Date(hiredAt(a) as string).getTime() - new Date(a.appliedAt).getTime()) / DAY)
  return { hires: days.length, days: days.length ? Math.round(days.reduce((s, x) => s + x, 0) / days.length) : null }
}

/** Average time-to-hire by the month the hire happened; months without hires are null. */
export function getTimeToHireTrend(data: Data, { months = 6, departmentId }: { months?: number; departmentId?: string } = {}) {
  const { jobsById } = indexData(data)
  const now = new Date()
  return Array.from({ length: months }, (_, i) => {
    const from = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1)
    const days = data.applications
      .filter((a) => a.status === 'hired' && deptMatch(jobsById.get(a.jobId), departmentId))
      .filter((a) => {
        const h = hiredAt(a)
        return h && new Date(h) >= from && new Date(h) < to
      })
      .map((a) => (new Date(hiredAt(a) as string).getTime() - new Date(a.appliedAt).getTime()) / DAY)
    return {
      month: from.toLocaleDateString('en-GB', { month: 'short' }),
      hires: days.length,
      timeToHire: days.length ? Math.round(days.reduce((s, x) => s + x, 0) / days.length) : null,
    }
  })
}

export function getOfferStats(data: Data, filters: Filters = {}) {
  const { jobsById } = indexData(data)
  const offers = data.offers.filter((o) => deptMatch(jobsById.get(o.jobId), filters.departmentId))
  const count = (s: string) => offers.filter((o) => o.status === s).length
  const accepted = count('accepted')
  const declined = count('declined')
  return {
    total: offers.length,
    accepted,
    declined,
    pending: count('sent') + count('negotiating'),
    draft: count('draft'),
    acceptanceRate: rate(accepted, accepted + declined),
  }
}

export function getVacancyStatus(data: Data, filters: Filters = {}) {
  const jobs = data.jobs.filter((j) => deptMatch(j, filters.departmentId))
  return (['open', 'on-hold', 'draft', 'closed'] as const).map((status) => ({ status, count: jobs.filter((j) => j.status === status).length }))
}

export function getOpenRoles(data: Data, filters: Filters = {}) {
  return data.jobs
    .filter((j) => j.status === 'open' && deptMatch(j, filters.departmentId))
    .map((j) => {
      const apps = data.applications.filter((a) => a.jobId === j.id)
      return {
        id: j.id,
        title: j.title,
        openings: j.openings,
        applicants: apps.length,
        active: apps.filter((a) => a.status === 'active').length,
        hired: apps.filter((a) => a.status === 'hired').length,
      }
    })
    .sort((a, b) => b.applicants - a.applicants)
}

export function getRecruiterWorkload(data: Data) {
  const { jobsById } = indexData(data)
  const now = Date.now()
  return data.users
    .filter((u) => (u.role === 'Recruiter' || u.role === 'Admin') && u.status === 'active')
    .map((u) => ({
      userId: u.id,
      name: u.name.split(' ')[0] ?? u.name,
      fullName: u.name,
      candidates: data.applications.filter((a) => a.status === 'active' && jobsById.get(a.jobId)?.recruiterId === u.id).length,
      interviews: data.interviews.filter((i) => i.status === 'scheduled' && jobsById.get(i.jobId)?.recruiterId === u.id && new Date(i.start).getTime() > now)
        .length,
      vacancies: data.jobs.filter((j) => j.recruiterId === u.id && j.status === 'open').length,
    }))
    .filter((r) => r.candidates + r.interviews + r.vacancies > 0)
}

export function getSourceBreakdown(data: Data, filters: Filters = {}) {
  return getSourceEffectiveness(data, filters).map(({ source, applications }) => ({ source, count: applications }))
}

/** Applications, interview reach and hires per candidate source. */
export function getSourceEffectiveness(data: Data, filters: Filters = {}) {
  const { jobsById, candidatesById } = indexData(data)
  const rows = new Map<string, { source: string; applications: number; interviewed: number; hired: number }>()
  data.applications
    .filter((a) => inScope(a, jobsById, filters))
    .forEach((a) => {
      const source = candidatesById.get(a.candidateId)?.source ?? 'Unknown'
      const row = rows.get(source) ?? { source, applications: 0, interviewed: 0, hired: 0 }
      row.applications += 1
      if (maxRankReached(a, jobsById.get(a.jobId)) >= 3) row.interviewed += 1
      if (a.status === 'hired') row.hired += 1
      rows.set(source, row)
    })
  return [...rows.values()]
    .map((r) => ({ ...r, interviewRate: rate(r.interviewed, r.applications), hireRate: rate(r.hired, r.applications) }))
    .sort((a, b) => b.applications - a.applications)
}
