import { createRng, pick, relativeDate, intBetween } from './seedUtils'
import { ONBOARDING_TASKS } from './mockSettings'

const DAY = 86_400_000

export function onboardingChecklist(prefix, doneCount = 0) {
  return ONBOARDING_TASKS.map((label, i) => ({ id: `${prefix}-t${i}`, label, done: i < doneCount }))
}

export function buildOffers({ applications, jobs, candidates }) {
  const rng = createRng(53)
  const offers = []

  applications.forEach((app) => {
    const job = jobs.find((j) => j.id === app.jobId)
    const stage = job.stages.find((s) => s.id === app.stageId)
    const candidate = candidates.find((c) => c.id === app.candidateId)
    if (stage.type !== 'offer' && stage.type !== 'hired') return

    const entered = app.history.find((h) => h.toStageId === stage.id)?.at ?? app.appliedAt
    const offerStageEntry = app.history.find((h) => job.stages.find((s) => s.id === h.toStageId)?.type === 'offer')?.at ?? entered
    const salary = Math.round(Math.min(job.salaryMax, candidate.expectedSalary * 1.02) / 10000) * 10000
    const base = {
      id: `off-${app.id}`,
      applicationId: app.id,
      candidateId: app.candidateId,
      jobId: app.jobId,
      salary,
      joiningBonus: job.departmentId === 'dep-eng' ? 100000 : 0,
      createdAt: offerStageEntry,
      createdById: job.recruiterId,
      sentAt: offerStageEntry,
      expiresAt: new Date(new Date(offerStageEntry).getTime() + DAY * 7).toISOString(),
      startDate: relativeDate(intBetween(rng, 10, 35)),
      respondedAt: null,
      notes: '',
      onboarding: onboardingChecklist(`off-${app.id}`, 0),
    }

    if (stage.type === 'hired') {
      offers.push({
        ...base,
        status: 'accepted',
        respondedAt: new Date(new Date(offerStageEntry).getTime() + DAY * 2).toISOString(),
        startDate: relativeDate(intBetween(rng, 3, 21)),
        onboarding: onboardingChecklist(base.id, intBetween(rng, 1, 5)),
      })
    } else if (app.status === 'rejected') {
      offers.push({ ...base, status: 'declined', respondedAt: new Date(new Date(offerStageEntry).getTime() + DAY * 3).toISOString(), notes: 'Accepted a counter-offer from current employer.' })
    } else {
      const status = pick(rng, ['sent', 'sent', 'sent', 'negotiating', 'draft'])
      offers.push({ ...base, status, sentAt: status === 'draft' ? null : base.sentAt })
    }
  })

  return offers
}
