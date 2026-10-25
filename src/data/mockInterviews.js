// Builds interviews and assessments that are consistent with each application's stage history.
import { createRng, pick, intBetween, workingDay } from './seedUtils'
import { mockScorecards, scorecardForStage, ASSESSMENT_FOR_WORKFLOW } from './mockSettings'

const INTERVIEWERS = {
  'dep-eng': ['usr-09', 'usr-05'],
  'dep-cc': ['usr-08', 'usr-06'],
  'dep-travel': ['usr-07'],
  'dep-bcf': ['usr-07'],
  'dep-hotel': ['usr-10'],
  'dep-ofr': ['usr-12'],
}

const STRENGTHS = [
  'Clear, structured answers and good examples from past roles.',
  'Calm under pressure during the escalation role-play.',
  'Solid fundamentals; explained trade-offs well.',
  'Excellent product and domain knowledge.',
  'Warm tone and strong rapport with the panel.',
]
const CONCERNS = [
  'Limited exposure to night-shift operations.',
  'Needed hints on the second problem.',
  'Salary expectation at the top of the band.',
  'Notice period may delay the joining date.',
  'Few examples of handling high-value clients.',
]

const DAY = 86_400_000

function enteredAt(app, stageId) {
  return app.history.find((h) => h.toStageId === stageId)?.at
}

function modeFor(departmentId, stageName, rng) {
  if (departmentId === 'dep-eng' || departmentId === 'dep-ofr') return 'Video'
  if (stageName.toLowerCase().includes('hr')) return pick(rng, ['Video', 'Phone'])
  return 'In person'
}

function locationFor(mode, job) {
  if (mode === 'Video') return 'Video call — link added when calendar integration is connected'
  if (mode === 'Phone') return 'Phone call — interviewer dials the candidate'
  return `${job.location} office — Interview room ${['2A', '3B', '4C'][job.title.length % 3]}`
}

function buildFeedback(rng, scorecardId, interviewerId, at, positive) {
  const scorecard = mockScorecards.find((s) => s.id === scorecardId)
  const base = positive ? 3.6 : 2.2
  const ratings = Object.fromEntries(
    scorecard.criteria.map((c) => [c.id, Math.max(1, Math.min(5, Math.round(base + rng() * 1.6)))]),
  )
  const avg = Object.values(ratings).reduce((a, b) => a + b, 0) / scorecard.criteria.length
  return {
    submittedById: interviewerId,
    submittedAt: at,
    ratings,
    recommendation: avg >= 4.2 ? 'strong-yes' : avg >= 3.2 ? 'yes' : avg >= 2.4 ? 'no' : 'strong-no',
    strengths: pick(rng, STRENGTHS),
    concerns: pick(rng, CONCERNS),
    summary: positive
      ? 'Recommend moving forward. Candidate meets the bar for this stage.'
      : 'Not recommending at this time; gaps against core requirements for the role.',
  }
}

export function buildInterviews({ applications, jobs }) {
  const rng = createRng(31)
  const now = Date.now()
  const interviews = []

  applications.forEach((app) => {
    const job = jobs.find((j) => j.id === app.jobId)
    const currentIdx = job.stages.findIndex((s) => s.id === app.stageId)

    job.stages.forEach((stage, idx) => {
      if (stage.type !== 'interview' || idx > currentIdx) return
      const entered = enteredAt(app, stage.id)
      if (!entered) return
      const panel = stage.name.toLowerCase().includes('hr') ? ['usr-11'] : [pick(rng, INTERVIEWERS[job.departmentId])]
      const mode = modeFor(job.departmentId, stage.name, rng)
      const scorecardId = scorecardForStage(stage.name)
      const base = {
        id: `int-${app.id}-${stage.id}`,
        applicationId: app.id,
        candidateId: app.candidateId,
        jobId: app.jobId,
        stageId: stage.id,
        stageName: stage.name,
        durationMin: stage.name.toLowerCase().includes('hr') ? 30 : pick(rng, [45, 60]),
        interviewerIds: panel,
        mode,
        location: locationFor(mode, job),
        scorecardId,
        createdById: job.recruiterId,
        createdAt: entered,
        cancelReason: null,
        reminderSentAt: null,
      }

      const passed = idx < currentIdx
      const rejectedHere = idx === currentIdx && app.status === 'rejected'

      if (passed || rejectedHere) {
        const start = new Date(new Date(entered).getTime() + DAY * intBetween(rng, 1, 2))
        start.setHours(intBetween(rng, 10, 16), pick(rng, [0, 30]), 0, 0)
        const startIso = new Date(Math.min(start.getTime(), now - DAY / 2)).toISOString()
        interviews.push({
          ...base,
          start: startIso,
          status: 'completed',
          attendance: 'attended',
          feedback: buildFeedback(rng, scorecardId, panel[0], startIso, !rejectedHere),
        })
        return
      }

      // Current stage, still active.
      const pendingFeedback = rng() < 0.3 && new Date(entered).getTime() < now - DAY * 1.2
      if (pendingFeedback) {
        const start = workingDay(-1, intBetween(rng, 10, 15), pick(rng, [0, 30]))
        interviews.push({ ...base, start, status: 'completed', attendance: 'attended', feedback: null })
      } else {
        const start = workingDay(intBetween(rng, 0, 9), intBetween(rng, 9, 17), pick(rng, [0, 30]))
        interviews.push({
          ...base,
          start,
          status: 'scheduled',
          attendance: rng() > 0.35 ? 'confirmed' : 'pending',
          reminderSentAt: rng() > 0.5 ? new Date(now - DAY / 3).toISOString() : null,
          feedback: null,
        })
      }
    })
  })

  return interviews
}

export function buildAssessments({ applications, jobs }) {
  const rng = createRng(41)
  const now = Date.now()
  const assessments = []

  applications.forEach((app) => {
    const job = jobs.find((j) => j.id === app.jobId)
    const currentIdx = job.stages.findIndex((s) => s.id === app.stageId)
    const templateId = ASSESSMENT_FOR_WORKFLOW[job.workflowTemplateId]

    job.stages.forEach((stage, idx) => {
      if (stage.type !== 'assessment' || idx > currentIdx) return
      const entered = enteredAt(app, stage.id)
      if (!entered) return
      const isCurrent = idx === currentIdx && app.status === 'active'
      const assignedAt = isCurrent ? new Date(Math.max(new Date(entered).getTime(), now - DAY * intBetween(rng, 1, 3))).toISOString() : entered
      // Most open assessments are still within their deadline; a few run late.
      const deadline = isCurrent
        ? new Date(now + DAY * (rng() < 0.22 ? -intBetween(rng, 1, 2) : intBetween(rng, 1, 5))).toISOString()
        : new Date(new Date(entered).getTime() + DAY * 3).toISOString()
      const base = {
        id: `asm-${app.id}-${stage.id}`,
        applicationId: app.id,
        candidateId: app.candidateId,
        jobId: app.jobId,
        stageId: stage.id,
        templateId,
        assignedAt,
        deadline,
        assignedById: job.recruiterId,
        reminderSentAt: null,
        notes: '',
      }
      const passed = idx < currentIdx
      const rejectedHere = idx === currentIdx && app.status === 'rejected'

      if (passed || rejectedHere) {
        const completedAt = new Date(Math.min(new Date(entered).getTime() + DAY * 2, now - DAY / 3)).toISOString()
        assessments.push({
          ...base,
          status: 'evaluated',
          score: passed ? intBetween(rng, 68, 94) : intBetween(rng, 32, 58),
          completedAt,
        })
        return
      }

      const roll = rng()
      const status = roll < 0.38 ? 'pending' : roll < 0.6 ? 'in-progress' : 'submitted'
      assessments.push({
        ...base,
        status,
        score: null,
        completedAt: status === 'submitted' ? new Date(now - DAY * rng()).toISOString() : null,
        reminderSentAt: status === 'pending' && rng() > 0.5 ? new Date(now - DAY / 2).toISOString() : null,
      })
    })
  })

  return assessments
}
