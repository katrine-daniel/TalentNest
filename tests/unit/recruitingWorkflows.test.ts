import { beforeEach, describe, expect, it } from 'vitest'
import { candidateService, findDuplicates, parseMentions } from '@/features/candidates/candidateService'
import { pipelineService } from '@/features/pipeline/pipelineService'
import { jobService } from '@/features/jobs/jobService'
import { requisitionService, canDecide } from '@/features/requisitions/requisitionService'
import { interviewService } from '@/features/interviews/interviewService'
import { offerService } from '@/features/offers/offerService'
import { onboardingService } from '@/features/onboarding/onboardingService'
import { feedbackCompletion } from '@/features/interviews/feedbackSelectors'
import { dataStore } from '@/services/storage/dataStore'
import { ADMIN, INTERVIEWER, RECRUITER, db, loadFreshDemo } from './helpers'

const ctx = { actorId: RECRUITER }
const openJob = () => db().jobs.find((j) => j.status === 'open')!

beforeEach(async () => {
  await loadFreshDemo()
})

describe('candidates & applications', () => {
  it('creates a candidate with an application at the first stage', async () => {
    const job = openJob()
    const c = await candidateService.create({ firstName: 'Test', lastName: 'Person', email: 'test.person@example.test', skills: ['Amadeus'], jobId: job.id }, ctx)
    const app = db().applications.find((a) => a.candidateId === c.id)
    expect(app?.stageId).toBe(job.stages[0]!.id)
    expect(app?.history[0]?.kind).toBe('applied')
  })

  it('rejects duplicate emails and duplicate applications', async () => {
    const existing = db().candidates[0]!
    await expect(candidateService.create({ firstName: 'X', lastName: 'Y', email: existing.email.toUpperCase() }, ctx)).rejects.toThrow(/already exists/)
    const app = db().applications.find((a) => a.candidateId === existing.id)!
    const job = db().jobs.find((j) => j.id === app.jobId)!
    if (job.status === 'open') await expect(candidateService.addApplication(existing.id, job.id, ctx)).rejects.toThrow(/already applied/)
  })

  it('only accepts applications to open vacancies', async () => {
    const closed = db().jobs.find((j) => j.status !== 'open')!
    await expect(candidateService.addApplication(db().candidates[0]!.id, closed.id, ctx)).rejects.toThrow(/open vacancies/)
  })

  it('detects likely duplicates by email, phone or name + location', () => {
    const c = db().candidates[3]!
    expect(findDuplicates({ email: c.email, firstName: '', lastName: '', phone: '', location: '' }, db().candidates)[0]?.reasons).toContain('same email')
    expect(findDuplicates({ email: 'new@x.test', firstName: c.firstName, lastName: c.lastName, phone: c.phone, location: c.location }, db().candidates)[0]?.reasons).toEqual(
      expect.arrayContaining(['same phone', 'same name and location']),
    )
  })

  it('notifies mentioned teammates and supports restricted notes', async () => {
    const target = db().users.find((u) => u.id === ADMIN)!
    expect(parseMentions(`ping @${target.name}`, db().users)).toEqual([ADMIN])
    const cand = db().candidates[0]!
    await candidateService.addNote(cand.id, `Please review, @${target.name}`, { actorId: RECRUITER, visibility: 'restricted' })
    expect(db().candidates[0]!.notes[0]).toMatchObject({ visibility: 'restricted', mentions: [ADMIN] })
    expect(db().notifications.some((n) => n.userId === ADMIN && n.type === 'mention')).toBe(true)
  })

  it('erases a candidate and all linked records', async () => {
    const c = db().candidates.find((x) => db().interviews.some((i) => i.candidateId === x.id))!
    await candidateService.erase(c.id, { actorId: ADMIN })
    const d = db()
    expect(d.candidates.some((x) => x.id === c.id)).toBe(false)
    expect(d.applications.some((a) => a.candidateId === c.id)).toBe(false)
    expect(d.interviews.some((i) => i.candidateId === c.id)).toBe(false)
    expect(d.activities[0]?.text).toMatch(/erased/)
    expect(d.activities[0]?.text).not.toContain(c.lastName)
  })
})

describe('pipeline transitions', () => {
  it('records stage history and publishes automation for interview stages', async () => {
    const app = db().applications.find((a) => a.status === 'active' && db().jobs.find((j) => j.id === a.jobId)?.stages.find((s) => s.id === a.stageId)?.type === 'screening')!
    const job = db().jobs.find((j) => j.id === app.jobId)!
    const interviewStage = job.stages.find((s) => s.type === 'interview')!
    await pipelineService.moveStage(app.id, interviewStage.id, { actorId: RECRUITER, note: 'Strong screen' })
    const updated = db().applications.find((a) => a.id === app.id)!
    expect(updated.stageId).toBe(interviewStage.id)
    expect(updated.history.at(-1)).toMatchObject({ kind: 'moved', fromStageId: app.stageId, note: 'Strong screen' })
    // Default rule "Prepare interviewers at interview stage" created a task for the hiring manager.
    expect(db().tasks.some((t) => t.applicationId === app.id && t.assigneeId === job.hiringManagerId)).toBe(true)
  })

  it('refuses to mark someone hired without an accepted offer', async () => {
    const app = db().applications.find((a) => a.status === 'active' && !db().offers.some((o) => o.applicationId === a.id))!
    const hired = db().jobs.find((j) => j.id === app.jobId)!.stages.find((s) => s.type === 'hired')!
    await expect(pipelineService.moveStage(app.id, hired.id, ctx)).rejects.toThrow(/accepted offer/)
  })

  it('requires restoring a rejected application before moving it', async () => {
    const app = db().applications.find((a) => a.status === 'active')!
    await pipelineService.reject(app.id, { actorId: RECRUITER, reason: 'Not a fit' })
    const other = db().jobs.find((j) => j.id === app.jobId)!.stages.find((s) => s.id !== app.stageId && s.type !== 'hired')!
    await expect(pipelineService.moveStage(app.id, other.id, ctx)).rejects.toThrow(/Restore/)
    await pipelineService.restore(app.id, ctx)
    await expect(pipelineService.moveStage(app.id, other.id, ctx)).resolves.toBeTruthy()
  })
})

describe('requisitions & publishing', () => {
  const input = { title: 'Visa Desk Executive', departmentId: 'dep-travel', justification: 'Visa processing volume doubled after the Schengen season started.', headcount: 2, budgetMin: 400000, budgetMax: 550000, hiringManagerId: 'usr-07', approverId: ADMIN }

  it('validates input and follows the approval workflow', async () => {
    await expect(requisitionService.create({ ...input, justification: 'short' }, { actorId: 'usr-07', submit: true })).rejects.toThrow(/business need/)
    const req = await requisitionService.create(input, { actorId: 'usr-07', submit: true })
    expect(req.status).toBe('pending')
    // Someone who is neither the approver nor an admin cannot decide.
    await expect(requisitionService.decide(req.id, 'approve', { actor: { id: RECRUITER, role: 'Recruiter' } })).rejects.toThrow(/assigned approver/)
    await expect(requisitionService.decide(req.id, 'reject', { actor: { id: ADMIN, role: 'Admin' } })).rejects.toThrow(/comment/)
    await requisitionService.decide(req.id, 'request-revision', { actor: { id: ADMIN, role: 'Admin' }, comment: 'Reduce to one position' })
    const revised = await requisitionService.update(req.id, { ...input, headcount: 1 }, { actorId: 'usr-07' })
    expect(revised.status).toBe('draft')
    await requisitionService.submit(req.id, { actorId: 'usr-07' })
    const approved = await requisitionService.decide(req.id, 'approve', { actor: { id: ADMIN, role: 'Admin' } })
    expect(approved.history.map((h) => h.action)).toEqual(['created', 'submitted', 'revision-requested', 'edited', 'submitted', 'approved'])
  })

  it('prevents requesters from approving their own requisition', () => {
    const req = { ...db().requisitions[0]!, status: 'pending' as const, createdById: 'usr-12', approverId: 'usr-12' }
    expect(canDecide(req, { id: 'usr-12', role: 'Hiring Manager' })).toBe(false)
    expect(canDecide(req, { id: ADMIN, role: 'Admin' })).toBe(true)
  })

  it('blocks publishing a vacancy without an approved requisition', async () => {
    const draft = db().jobs.find((j) => j.status === 'draft')!
    await expect(jobService.setStatus(draft.id, 'open', ctx)).rejects.toThrow(/must be approved/)
    const pending = db().requisitions.find((r) => r.id === draft.requisitionId)!
    await requisitionService.decide(pending.id, 'approve', { actor: { id: ADMIN, role: 'Admin' } })
    await expect(jobService.setStatus(draft.id, 'open', ctx)).resolves.toMatchObject({ status: 'open' })
  })
})

describe('interview scorecards', () => {
  it('lets only panelists save drafts and submit, and tracks completion', async () => {
    const app = db().applications.find((a) => a.status === 'active')!
    const job = db().jobs.find((j) => j.id === app.jobId)!
    const stage = job.stages.find((s) => s.type === 'interview')!
    const start = new Date(Date.now() + 86_400_000 * 3).toISOString()
    const interview = await interviewService.schedule({ applicationId: app.id, stageId: stage.id, start, durationMin: 45, interviewerIds: [INTERVIEWER, ADMIN], mode: 'Video', allowConflict: true }, { actorId: RECRUITER })
    expect(db().notifications.filter((n) => n.userId === INTERVIEWER && n.type === 'interview')).toHaveLength(1)

    const scorecard = db().scorecards.find((s) => s.id === interview.scorecardId)!
    const ratings = Object.fromEntries(scorecard.criteria.map((c) => [c.id, 4]))
    await expect(interviewService.saveFeedback(interview.id, { ratings, recommendation: 'yes', strengths: 'Clear' }, { actorId: RECRUITER, submit: true })).rejects.toThrow(/panel/)

    await interviewService.saveFeedback(interview.id, { ratings: {}, strengths: 'draft' }, { actorId: INTERVIEWER, submit: false })
    expect(feedbackCompletion(db().interviews.find((i) => i.id === interview.id)!, db().interviewFeedback)).toMatchObject({ submitted: 0, total: 2 })
    await expect(interviewService.saveFeedback(interview.id, { ratings: {}, recommendation: 'yes' }, { actorId: INTERVIEWER, submit: true })).rejects.toThrow(/Rate every criterion/)

    await interviewService.saveFeedback(interview.id, { ratings, recommendation: 'yes', strengths: 'Clear' }, { actorId: INTERVIEWER, submit: true })
    await interviewService.saveFeedback(interview.id, { ratings, recommendation: 'no', strengths: 'Ok' }, { actorId: ADMIN, submit: true })
    const done = feedbackCompletion(db().interviews.find((i) => i.id === interview.id)!, db().interviewFeedback)
    expect(done).toMatchObject({ submitted: 2, complete: true })
    await expect(interviewService.saveFeedback(interview.id, { ratings, recommendation: 'yes' }, { actorId: INTERVIEWER, submit: true })).rejects.toThrow(/already submitted/)
  })
})

describe('offers & onboarding', () => {
  it('enforces offer transitions; acceptance hires the candidate and starts onboarding', async () => {
    const offer = db().offers.find((o) => o.status === 'sent' || o.status === 'negotiating')!
    await expect(offerService.setStatus(offer.id, 'draft', ctx)).rejects.toThrow(/cannot be marked/)
    await offerService.setStatus(offer.id, 'accepted', ctx)
    const app = db().applications.find((a) => a.id === offer.applicationId)!
    expect(app.status).toBe('hired')
    const plan = db().onboardingPlans.find((p) => p.offerId === offer.id)
    expect(plan?.tasks.length).toBeGreaterThan(3)
    // Automation is idempotent: a second start is refused.
    await expect(onboardingService.start(offer.id, 'obt-standard', ctx)).rejects.toThrow(/already exists/)
    // Tasks that need a document cannot be completed without one.
    const docTask = plan!.tasks.find((t) => t.requiresDocument)!
    await expect(onboardingService.toggleTask(plan!.id, docTask.id, ctx)).rejects.toThrow(/Upload the required document/)
    await onboardingService.uploadDocument(plan!.id, docTask.id, new File(['%PDF-1.4'], 'offer.pdf', { type: 'application/pdf' }), ctx)
    await onboardingService.toggleTask(plan!.id, docTask.id, ctx)
    expect(dataStore.read('onboardingPlans').find((p) => p.id === plan!.id)?.status).toMatch(/in-progress|blocked/)
  })
})
