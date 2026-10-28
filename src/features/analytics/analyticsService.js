// Pure reporting selectors computed from the current data set.
// With a backend these would be served by reporting endpoints instead.
import { stageRank } from '@/utils/statusHelpers'
import { isAssessmentOverdue } from '@/features/assessments/assessmentService'

const DAY = 86_400_000

export function indexData(data) {
  const jobsById = new Map(data.jobs.map((j) => [j.id, j]))
  const candidatesById = new Map(data.candidates.map((c) => [c.id, c]))
  const usersById = new Map(data.users.map((u) => [u.id, u]))
  const departmentsById = new Map(data.departments.map((d) => [d.id, d]))
  const templatesById = new Map(data.assessmentTemplates.map((t) => [t.id, t]))
  const stageOf = (app) => jobsById.get(app.jobId)?.stages.find((s) => s.id === app.stageId)
  return { jobsById, candidatesById, usersById, departmentsById, templatesById, stageOf }
}

function inScope(app, jobsById, { departmentId, sinceDays } = {}) {
  const job = jobsById.get(app.jobId)
  if (!job) return false
  if (departmentId && departmentId !== 'all' && job.departmentId !== departmentId) return false
  if (sinceDays && new Date(app.appliedAt).getTime() < Date.now() - sinceDays * DAY) return false
  return true
}

function maxRankReached(app, job) {
  return app.history.reduce((max, h) => {
    const type = job.stages.find((s) => s.id === h.toStageId)?.type
    return Math.max(max, stageRank(type))
  }, 0)
}

export function getDashboardMetrics(data, filters = {}) {
  const { jobsById } = indexData(data)
  const now = Date.now()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deptOk = (jobId) => !filters.departmentId || filters.departmentId === 'all' || jobsById.get(jobId)?.departmentId === filters.departmentId

  const activeApps = data.applications.filter((a) => a.status === 'active' && inScope(a, jobsById, filters))
  const activeCandidates = new Set(activeApps.map((a) => a.candidateId)).size
  const newThisWeek = data.applications.filter((a) => deptOk(a.jobId) && new Date(a.appliedAt).getTime() > now - 7 * DAY).length

  const openJobs = data.jobs.filter((j) => j.status === 'open' && deptOk(j.id))
  const openings = openJobs.reduce((sum, j) => sum + j.openings, 0)

  const upcomingInterviews = data.interviews.filter((i) => i.status === 'scheduled' && deptOk(i.jobId) && new Date(i.start).getTime() >= today.getTime())
  const interviewsToday = upcomingInterviews.filter((i) => new Date(i.start).getTime() < today.getTime() + DAY).length

  const openAssessments = data.assessments.filter((a) => ['pending', 'in-progress', 'submitted'].includes(a.status) && deptOk(a.jobId))
  const overdueAssessments = openAssessments.filter((a) => isAssessmentOverdue(a, now)).length

  const awaitingOffers = data.offers.filter((o) => ['sent', 'negotiating'].includes(o.status) && deptOk(o.jobId))
  const expiringOffers = awaitingOffers.filter((o) => new Date(o.expiresAt).getTime() < now + 2 * DAY).length

  const attention = getAttentionItems(data, filters)

  return {
    activeCandidates,
    newThisWeek,
    openVacancies: openJobs.length,
    openings,
    interviewsScheduled: upcomingInterviews.length,
    interviewsToday,
    assessmentsPending: openAssessments.length,
    overdueAssessments,
    offersAwaiting: awaitingOffers.length,
    expiringOffers,
    needsAttention: attention.length,
    pendingFeedback: attention.filter((a) => a.kind === 'feedback').length,
  }
}

export function getFunnel(data, filters = {}) {
  const { jobsById } = indexData(data)
  const steps = [
    { key: 'application', label: 'Applied', rank: 0 },
    { key: 'screening', label: 'Screened', rank: 1 },
    { key: 'assessment', label: 'Assessed', rank: 2 },
    { key: 'interview', label: 'Interviewed', rank: 3 },
    { key: 'offer', label: 'Offered', rank: 5 },
    { key: 'hired', label: 'Hired', rank: 6 },
  ]
  const apps = data.applications.filter((a) => inScope(a, jobsById, filters))
  const reached = apps.map((a) => maxRankReached(a, jobsById.get(a.jobId)))
  return steps.map((step, i) => {
    const count = reached.filter((r) => r >= step.rank).length
    const prev = i === 0 ? count : reached.filter((r) => r >= steps[i - 1].rank).length
    return { ...step, count, conversion: prev ? Math.round((count / prev) * 100) : 0 }
  })
}

const GROUPS = [
  { key: 'early', label: 'Applied & screening', types: ['application', 'screening'] },
  { key: 'assessment', label: 'Assessment', types: ['assessment'] },
  { key: 'interview', label: 'Interviews', types: ['interview'] },
  { key: 'late', label: 'Decision & offer', types: ['decision', 'offer'] },
]

export function getDepartmentBreakdown(data, filters = {}) {
  const { jobsById, stageOf } = indexData(data)
  return data.departments
    .map((dept) => {
      const apps = data.applications.filter((a) => a.status === 'active' && jobsById.get(a.jobId)?.departmentId === dept.id && inScope(a, jobsById, { sinceDays: filters.sinceDays }))
      const row = { departmentId: dept.id, name: dept.name, short: dept.code, total: apps.length }
      GROUPS.forEach((g) => {
        row[g.key] = apps.filter((a) => g.types.includes(stageOf(a)?.type)).length
      })
      row.hired = data.applications.filter((a) => a.status === 'hired' && jobsById.get(a.jobId)?.departmentId === dept.id).length
      row.openings = data.jobs.filter((j) => j.departmentId === dept.id && j.status === 'open').reduce((s, j) => s + j.openings, 0)
      return row
    })
    .filter((r) => r.total > 0 || r.openings > 0)
}

export const BREAKDOWN_GROUPS = GROUPS

export function getAttentionItems(data, filters = {}) {
  const { jobsById, candidatesById, stageOf } = indexData(data)
  const now = Date.now()
  const deptOk = (jobId) => !filters.departmentId || filters.departmentId === 'all' || jobsById.get(jobId)?.departmentId === filters.departmentId
  const name = (id) => {
    const c = candidatesById.get(id)
    return c ? `${c.firstName} ${c.lastName}` : 'Candidate'
  }
  const items = []

  data.interviews
    .filter((i) => i.status === 'completed' && !i.feedback && deptOk(i.jobId))
    .forEach((i) => items.push({ id: `fb-${i.id}`, kind: 'feedback', title: `Feedback pending — ${name(i.candidateId)}`, subtitle: `${i.stageName} · ${jobsById.get(i.jobId)?.title}`, due: i.start, overdue: now - new Date(i.start).getTime() > DAY, link: `/calendar?event=${i.id}` }))

  data.assessments
    .filter((a) => deptOk(a.jobId) && (isAssessmentOverdue(a, now) || a.status === 'submitted'))
    .forEach((a) =>
      items.push({
        id: `as-${a.id}`,
        kind: a.status === 'submitted' ? 'review' : 'assessment',
        title: a.status === 'submitted' ? `Review assessment — ${name(a.candidateId)}` : `Assessment overdue — ${name(a.candidateId)}`,
        subtitle: jobsById.get(a.jobId)?.title,
        due: a.status === 'submitted' ? a.completedAt : a.deadline,
        overdue: a.status !== 'submitted',
        link: `/assessments?status=${a.status === 'submitted' ? 'submitted' : 'overdue'}`,
      }),
    )

  data.offers
    .filter((o) => ['sent', 'negotiating'].includes(o.status) && deptOk(o.jobId) && new Date(o.expiresAt).getTime() < now + 2 * DAY)
    .forEach((o) => items.push({ id: `of-${o.id}`, kind: 'offer', title: `Offer expiring — ${name(o.candidateId)}`, subtitle: jobsById.get(o.jobId)?.title, due: o.expiresAt, overdue: new Date(o.expiresAt).getTime() < now, link: '/offers' }))

  data.applications
    .filter((a) => a.status === 'active' && deptOk(a.jobId) && ['application', 'screening'].includes(stageOf(a)?.type) && now - new Date(a.updatedAt).getTime() > 6 * DAY)
    .forEach((a) => items.push({ id: `st-${a.id}`, kind: 'stale', title: `No movement in ${Math.round((now - new Date(a.updatedAt).getTime()) / DAY)} days — ${name(a.candidateId)}`, subtitle: `${stageOf(a)?.name} · ${jobsById.get(a.jobId)?.title}`, due: a.updatedAt, overdue: false, link: `/candidates/${a.candidateId}` }))

  const order = { feedback: 0, assessment: 1, offer: 2, review: 3, stale: 4 }
  return items.sort((a, b) => order[a.kind] - order[b.kind] || new Date(a.due) - new Date(b.due))
}

export function getUpcomingSchedule(data, { departmentId, days = 7 } = {}) {
  const { jobsById } = indexData(data)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = start.getTime() + days * DAY
  const deptOk = (jobId) => !departmentId || departmentId === 'all' || jobsById.get(jobId)?.departmentId === departmentId
  const interviews = data.interviews
    .filter((i) => i.status === 'scheduled' && deptOk(i.jobId) && new Date(i.start).getTime() >= start.getTime() && new Date(i.start).getTime() < end)
    .map((i) => ({ kind: 'interview', id: i.id, at: i.start, item: i }))
  const assessments = data.assessments
    .filter((a) => ['pending', 'in-progress'].includes(a.status) && deptOk(a.jobId) && new Date(a.deadline).getTime() >= start.getTime() && new Date(a.deadline).getTime() < end)
    .map((a) => ({ kind: 'assessment', id: a.id, at: a.deadline, item: a }))
  return [...interviews, ...assessments].sort((a, b) => new Date(a.at) - new Date(b.at))
}

export function getAssessmentPassRates(data, filters = {}) {
  const { jobsById } = indexData(data)
  return data.assessmentTemplates
    .map((t) => {
      const evaluated = data.assessments.filter((a) => a.templateId === t.id && a.status === 'evaluated' && (!filters.departmentId || filters.departmentId === 'all' || jobsById.get(a.jobId)?.departmentId === filters.departmentId))
      const passed = evaluated.filter((a) => a.score >= t.passMark).length
      return { id: t.id, name: t.name.replace(' Assessment', '').replace(' — Web Stack', ''), evaluated: evaluated.length, passed, rate: evaluated.length ? Math.round((passed / evaluated.length) * 100) : 0, passMark: t.passMark }
    })
    .filter((r) => r.evaluated > 0)
}

export function getInterviewConversion(data, filters = {}) {
  const { jobsById } = indexData(data)
  const buckets = new Map()
  data.interviews
    .filter((i) => i.feedback && (!filters.departmentId || filters.departmentId === 'all' || jobsById.get(i.jobId)?.departmentId === filters.departmentId))
    .forEach((i) => {
      const key = i.stageName
      const b = buckets.get(key) ?? { stage: key, completed: 0, advanced: 0 }
      b.completed += 1
      if (['yes', 'strong-yes'].includes(i.feedback.recommendation)) b.advanced += 1
      buckets.set(key, b)
    })
  return [...buckets.values()].map((b) => ({ ...b, rate: Math.round((b.advanced / b.completed) * 100) })).sort((a, b) => b.completed - a.completed)
}

export function getTimeToHire(data) {
  const { jobsById } = indexData(data)
  const hired = data.applications.filter((a) => a.status === 'hired')
  const byDept = data.departments.map((d) => {
    const own = hired.filter((a) => jobsById.get(a.jobId)?.departmentId === d.id)
    const days = own.map((a) => {
      const hiredAt = a.history.find((h) => h.kind === 'hired')?.at ?? a.updatedAt
      return (new Date(hiredAt) - new Date(a.appliedAt)) / DAY
    })
    const reference = data.reporting.timeToHireByDepartment.find((x) => x.departmentId === d.id)?.days ?? 0
    return {
      departmentId: d.id,
      name: d.name,
      short: d.code,
      days: days.length ? Math.round(days.reduce((s, x) => s + x, 0) / days.length) : reference,
      hires: own.length,
      source: days.length ? 'live' : 'historical',
    }
  })
  return byDept
}

export function getOfferStats(data, filters = {}) {
  const { jobsById } = indexData(data)
  const offers = data.offers.filter((o) => !filters.departmentId || filters.departmentId === 'all' || jobsById.get(o.jobId)?.departmentId === filters.departmentId)
  const count = (s) => offers.filter((o) => o.status === s).length
  const accepted = count('accepted')
  const declined = count('declined')
  return {
    total: offers.length,
    accepted,
    declined,
    pending: count('sent') + count('negotiating'),
    draft: count('draft'),
    acceptanceRate: accepted + declined ? Math.round((accepted / (accepted + declined)) * 100) : 0,
  }
}

export function getVacancyStatus(data, filters = {}) {
  const jobs = data.jobs.filter((j) => !filters.departmentId || filters.departmentId === 'all' || j.departmentId === filters.departmentId)
  return ['open', 'on-hold', 'draft', 'closed'].map((status) => ({ status, count: jobs.filter((j) => j.status === status).length }))
}

export function getRecruiterWorkload(data) {
  const { jobsById } = indexData(data)
  const now = Date.now()
  return data.users
    .filter((u) => u.role === 'Recruiter' || u.role === 'Admin')
    .filter((u) => u.status === 'active')
    .map((u) => {
      const apps = data.applications.filter((a) => a.status === 'active' && jobsById.get(a.jobId)?.recruiterId === u.id)
      const interviews = data.interviews.filter((i) => i.status === 'scheduled' && jobsById.get(i.jobId)?.recruiterId === u.id && new Date(i.start).getTime() > now)
      const jobs = data.jobs.filter((j) => j.recruiterId === u.id && j.status === 'open')
      return { userId: u.id, name: u.name.split(' ')[0], fullName: u.name, candidates: apps.length, interviews: interviews.length, vacancies: jobs.length }
    })
    .filter((r) => r.candidates + r.interviews + r.vacancies > 0)
}

export function getSourceBreakdown(data, filters = {}) {
  const { jobsById, candidatesById } = indexData(data)
  const counts = new Map()
  data.applications
    .filter((a) => inScope(a, jobsById, filters))
    .forEach((a) => {
      const src = candidatesById.get(a.candidateId)?.source ?? 'Other'
      counts.set(src, (counts.get(src) ?? 0) + 1)
    })
  return [...counts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count)
}
