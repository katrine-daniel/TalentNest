// Assembles the full demo data set. Everything is relative to "now" so the demo always looks current.
import { createRng, pick, intBetween, relativeDate } from './seedUtils'
import { mockDepartments, mockUsers } from './mockOrganization'
import { mockWorkflowTemplates, stagesFromTemplate } from './mockWorkflows'
import { mockJobs } from './mockJobs'
import { buildCandidates, CANDIDATE_COUNT, CANDIDATE_SOURCES } from './mockCandidates'
import { buildInterviews, buildAssessments } from './mockInterviews'
import { buildOffers } from './mockOffers'
import { buildMonthlyHistory, buildWeeklyHistory, mockTimeToHireByDepartment } from './mockDashboard'
import {
  mockAssessmentTemplates,
  mockScorecards,
  mockNotificationPrefs,
  mockSettingsMeta,
} from './mockSettings'

export const SEED_VERSION = 6

const JOB_WEIGHTS = {
  'job-101': 4, 'job-102': 3, 'job-103': 9, 'job-104': 6, 'job-105': 2, 'job-106': 6,
  'job-107': 3, 'job-108': 4, 'job-109': 3, 'job-110': 4, 'job-112': 2,
}

const STAGE_WEIGHTS = { application: 20, screening: 18, assessment: 16, interview: 13, decision: 8, offer: 10, hired: 6 }

const REJECT_REASONS = [
  'Did not meet the minimum score on the assessment.',
  'Communication level below requirement for international voice.',
  'Experience not aligned with role requirements.',
  'Candidate unresponsive after two follow-ups.',
]

function weightedStageIndex(rng, stages, job) {
  if (job.status === 'closed') return stages.length - 1
  const weights = stages.map((s) => {
    if (job.status === 'on-hold' && s.type !== 'application' && s.type !== 'screening' && s.type !== 'assessment') return 1
    return STAGE_WEIGHTS[s.type] ?? 5
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = rng() * total
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i]
    if (roll <= 0) return i
  }
  return 0
}

function buildApplication(rng, { id, candidate, job, forceEarly = false }) {
  const stages = job.stages
  let idx = forceEarly ? intBetween(rng, 0, 2) : weightedStageIndex(rng, stages, job)
  const closedReject = job.status === 'closed' && rng() < 0.5
  if (closedReject) idx = intBetween(rng, 1, stages.length - 3)

  const daysAgo = Math.min(80, intBetween(rng, 2 + idx * 3, 7 + idx * 5) + (job.status === 'closed' ? 40 : 0))
  const step = Math.max(1, Math.floor((daysAgo - 1) / (idx + 1)))
  const history = []
  for (let k = 0; k <= idx; k += 1) {
    const at = relativeDate(-daysAgo + k * step, intBetween(rng, 9, 18), pick(rng, [0, 15, 30, 45]))
    history.push({
      id: `${id}-h${k}`,
      kind: k === 0 ? 'applied' : stages[k].type === 'hired' ? 'hired' : 'moved',
      fromStageId: k === 0 ? null : stages[k - 1].id,
      toStageId: stages[k].id,
      at,
      byId: k === 0 ? null : job.recruiterId,
      note: k === 0 ? `Applied via ${candidate.source}` : '',
    })
  }

  const stage = stages[idx]
  let status = stage.type === 'hired' ? 'hired' : 'active'
  const canReject = idx >= 1 && stage.type !== 'hired' && stage.type !== 'offer'
  if (closedReject || (canReject && rng() < 0.13) || (stage.type === 'offer' && rng() < 0.08)) {
    status = 'rejected'
    history.push({
      id: `${id}-hr`,
      kind: 'rejected',
      fromStageId: stage.id,
      toStageId: stage.id,
      at: relativeDate(Math.min(-1, -daysAgo + idx * step + intBetween(rng, 1, 3)), intBetween(rng, 11, 18)),
      byId: job.recruiterId,
      note: stage.type === 'offer' ? 'Offer declined by candidate.' : pick(rng, REJECT_REASONS),
    })
  }

  return {
    id,
    candidateId: candidate.id,
    jobId: job.id,
    stageId: stage.id,
    status,
    rating: idx >= 2 ? intBetween(rng, 2, 5) : null,
    appliedAt: history[0].at,
    updatedAt: history[history.length - 1].at,
    history,
  }
}

function buildActivities({ applications, interviews, assessments, offers, jobs, candidates }) {
  const activities = []
  const name = (id) => {
    const c = candidates.find((x) => x.id === id)
    return c ? `${c.firstName} ${c.lastName}` : 'Candidate'
  }
  const stageName = (jobId, stageId) => jobs.find((j) => j.id === jobId)?.stages.find((s) => s.id === stageId)?.name

  applications.forEach((app) => {
    const job = jobs.find((j) => j.id === app.jobId)
    app.history.forEach((h) => {
      const text =
        h.kind === 'applied'
          ? `${name(app.candidateId)} applied for ${job.title}`
          : h.kind === 'rejected'
            ? `${name(app.candidateId)} was not progressed at ${stageName(app.jobId, h.toStageId)}`
            : h.kind === 'hired'
              ? `${name(app.candidateId)} was hired as ${job.title}`
              : `${name(app.candidateId)} moved to ${stageName(app.jobId, h.toStageId)}`
      activities.push({ id: `act-${h.id}`, at: h.at, type: h.kind === 'applied' ? 'application' : 'stage', actorId: h.byId, candidateId: app.candidateId, jobId: app.jobId, text })
    })
  })

  interviews.forEach((i) => {
    activities.push({ id: `act-${i.id}-s`, at: i.createdAt, type: 'interview', actorId: i.createdById, candidateId: i.candidateId, jobId: i.jobId, text: `${i.stageName} scheduled with ${name(i.candidateId)}` })
    if (i.feedback) {
      activities.push({ id: `act-${i.id}-f`, at: i.feedback.submittedAt, type: 'feedback', actorId: i.feedback.submittedById, candidateId: i.candidateId, jobId: i.jobId, text: `Feedback submitted for ${name(i.candidateId)} — ${i.stageName}` })
    }
  })

  assessments.forEach((a) => {
    if (a.completedAt) {
      activities.push({ id: `act-${a.id}`, at: a.completedAt, type: 'assessment', actorId: null, candidateId: a.candidateId, jobId: a.jobId, text: `${name(a.candidateId)} submitted an assessment` })
    }
  })

  offers.forEach((o) => {
    if (o.sentAt) activities.push({ id: `act-${o.id}-s`, at: o.sentAt, type: 'offer', actorId: o.createdById, candidateId: o.candidateId, jobId: o.jobId, text: `Offer sent to ${name(o.candidateId)}` })
  })

  const now = Date.now()
  return activities
    .filter((a) => new Date(a.at).getTime() <= now)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 160)
}

function buildNotifications({ interviews, assessments, offers, applications, candidates, jobs }) {
  const name = (id) => {
    const c = candidates.find((x) => x.id === id)
    return c ? `${c.firstName} ${c.lastName}` : 'Candidate'
  }
  const items = []
  interviews
    .filter((i) => i.status === 'completed' && !i.feedback)
    .slice(0, 3)
    .forEach((i) => items.push({ id: `ntf-${i.id}`, type: 'feedback', title: 'Feedback pending', body: `${i.stageName} with ${name(i.candidateId)} needs a scorecard.`, at: i.start, read: false, link: `/calendar?event=${i.id}` }))
  assessments
    .filter((a) => a.status === 'submitted')
    .slice(0, 3)
    .forEach((a) => items.push({ id: `ntf-${a.id}`, type: 'assessment', title: 'Assessment submitted', body: `${name(a.candidateId)} completed their assessment and is ready for review.`, at: a.completedAt, read: false, link: '/assessments?status=submitted' }))
  offers
    .filter((o) => o.status === 'negotiating')
    .forEach((o) => items.push({ id: `ntf-${o.id}`, type: 'offer', title: 'Offer negotiation', body: `${name(o.candidateId)} asked to revisit the compensation.`, at: o.sentAt, read: true, link: '/offers' }))
  applications
    .filter((a) => a.history.length === 1 && a.status === 'active')
    .slice(0, 4)
    .forEach((a) => items.push({ id: `ntf-${a.id}`, type: 'application', title: 'New application', body: `${name(a.candidateId)} applied for ${jobs.find((j) => j.id === a.jobId)?.title}.`, at: a.appliedAt, read: true, link: `/candidates/${a.candidateId}` }))
  return items.sort((a, b) => new Date(b.at) - new Date(a.at))
}

export function createSeed() {
  const rng = createRng(11)

  const jobs = mockJobs.map((job) => ({
    ...job,
    stages: stagesFromTemplate(mockWorkflowTemplates.find((t) => t.id === job.workflowTemplateId), job.id),
  }))

  const applyable = jobs.filter((j) => j.status !== 'draft')
  const weighted = applyable.flatMap((j) => Array(JOB_WEIGHTS[j.id] ?? 1).fill(j))
  const primaryJobs = Array.from({ length: CANDIDATE_COUNT }, (_, i) => (i < applyable.length ? applyable[i] : pick(rng, weighted)))

  const candidates = buildCandidates(primaryJobs, (job) => job.recruiterId)

  const applications = candidates.map((candidate, i) =>
    buildApplication(rng, { id: `app-${1001 + i}`, candidate, job: primaryJobs[i] }),
  )

  // A handful of candidates applied to a second, related vacancy.
  const related = { 'dep-travel': ['job-106', 'job-107', 'job-110'], 'dep-bcf': ['job-110', 'job-106'], 'dep-cc': ['job-103', 'job-104'], 'dep-eng': ['job-101', 'job-102'] }
  candidates.forEach((candidate, i) => {
    if (i % 6 !== 2) return
    const options = (related[primaryJobs[i].departmentId] ?? []).filter((id) => id !== primaryJobs[i].id)
    if (!options.length) return
    const jobId = pick(rng, options)
    const job = jobs.find((j) => j.id === jobId)
    applications.push(buildApplication(rng, { id: `app-${2001 + i}`, candidate, job, forceEarly: true }))
  })

  const interviews = buildInterviews({ applications, jobs })
  const assessments = buildAssessments({ applications, jobs })
  const offers = buildOffers({ applications, jobs, candidates })
  const activities = buildActivities({ applications, interviews, assessments, offers, jobs, candidates })
  const notifications = buildNotifications({ interviews, assessments, offers, applications, candidates, jobs })

  return {
    version: SEED_VERSION,
    seededAt: new Date().toISOString(),
    users: mockUsers,
    departments: mockDepartments,
    workflowTemplates: mockWorkflowTemplates,
    jobs,
    candidates,
    applications,
    interviews,
    assessments,
    offers,
    activities,
    notifications,
    assessmentTemplates: mockAssessmentTemplates,
    scorecards: mockScorecards,
    settings: {
      rolePermissions: mockSettingsMeta.rolePermissions,
      notificationPrefs: mockNotificationPrefs,
    },
    reporting: {
      monthly: buildMonthlyHistory(12),
      weekly: buildWeeklyHistory(12),
      timeToHireByDepartment: mockTimeToHireByDepartment,
      sources: CANDIDATE_SOURCES,
    },
  }
}
