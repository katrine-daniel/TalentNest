import { dataStore } from '@/services/storage/dataStore'
import { fileStorage } from '@/services/storage/fileStorage'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, pushNotification } from '@/services/activityService'
import { eventBus } from '@/services/events/eventBus'
import { createId, nextCandidateRef } from '@/utils/ids'
import type { Application, Candidate, CandidateNote } from '@/types/domain'

interface Ctx {
  actorId: string
}

const normEmail = (e: string) => e.trim().toLowerCase()
const normPhone = (p: string) => p.replace(/\D/g, '').slice(-10)

export interface CandidateInput {
  firstName: string
  lastName: string
  email: string
  phone?: string
  location?: string
  currentTitle?: string
  currentCompany?: string
  experienceYears?: number | string
  noticePeriod?: string
  expectedSalary?: number | string
  source?: string
  recruiterId?: string
  skills?: string[]
  tags?: string[]
  education?: string
  note?: string
  jobId?: string
}

/** Finds existing candidates that are probably the same person (email, phone, or name + location). */
export function findDuplicates(
  input: Pick<CandidateInput, 'email' | 'phone' | 'firstName' | 'lastName' | 'location'>,
  candidates: readonly Candidate[],
  excludeId?: string,
) {
  const email = input.email ? normEmail(input.email) : ''
  const phone = input.phone ? normPhone(input.phone) : ''
  const name = `${input.firstName ?? ''} ${input.lastName ?? ''}`.trim().toLowerCase()
  return candidates
    .filter((c) => c.id !== excludeId)
    .map((c) => {
      const reasons: string[] = []
      if (email && normEmail(c.email) === email) reasons.push('same email')
      if (phone.length >= 8 && normPhone(c.phone) === phone) reasons.push('same phone')
      if (name && `${c.firstName} ${c.lastName}`.toLowerCase() === name && (!input.location || c.location.toLowerCase() === input.location.toLowerCase()))
        reasons.push('same name and location')
      return { candidate: c, reasons }
    })
    .filter((d) => d.reasons.length > 0)
}

function newApplication({ candidateId, jobId, source }: { candidateId: string; jobId: string; source: string }): Application {
  const job = dataStore.read('jobs').find((j) => j.id === jobId)
  if (!job) throw new ServiceError('Vacancy not found')
  if (job.status !== 'open') throw new ServiceError('Applications can only be added to open vacancies')
  const exists = dataStore.read('applications').some((a) => a.candidateId === candidateId && a.jobId === jobId)
  if (exists) throw new ServiceError('Candidate has already applied to this vacancy')
  const first = job.stages[0]
  if (!first) throw new ServiceError('This vacancy has no workflow stages')
  const now = new Date().toISOString()
  const id = createId('app')
  return {
    id,
    candidateId,
    jobId,
    stageId: first.id,
    status: 'active',
    rating: null,
    appliedAt: now,
    updatedAt: now,
    history: [{ id: `${id}-h0`, kind: 'applied', fromStageId: null, toStageId: first.id, at: now, byId: null, note: `Added via ${source || 'recruiter'}` }],
  }
}

async function publishApplicationCreated(app: Application, actorId: string) {
  await eventBus.publish({
    type: 'application.created',
    entityId: app.id,
    actorId,
    context: { applicationId: app.id, candidateId: app.candidateId, jobId: app.jobId, stageId: app.stageId },
  })
}

/** Resolves @First Last mentions to user ids. */
export function parseMentions(text: string, users: ReadonlyArray<{ id: string; name: string; status: string }>) {
  const lower = text.toLowerCase()
  return users.filter((u) => u.status === 'active' && lower.includes(`@${u.name.toLowerCase()}`)).map((u) => u.id)
}

export const candidateService = {
  async create(values: CandidateInput, { actorId }: Ctx, resumeFile?: File | null) {
    // Upload first so a failed upload never leaves a half-created candidate.
    const resume = resumeFile ? await fileStorage.upload(resumeFile, 'resumes', ['pdf', 'doc', 'docx']) : null
    const { candidate, app } = await mockRequest(() => {
      const candidates = dataStore.read('candidates')
      if (candidates.some((c) => normEmail(c.email) === normEmail(values.email))) throw new ServiceError('A candidate with this email already exists')
      const id = createId('cand')
      const now = new Date().toISOString()
      const created: Candidate = {
        id,
        ref: nextCandidateRef(candidates),
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        phone: values.phone?.trim() ?? '',
        location: values.location?.trim() ?? '',
        currentTitle: values.currentTitle?.trim() || 'Not specified',
        currentCompany: values.currentCompany?.trim() || '—',
        experienceYears: Number(values.experienceYears) || 0,
        noticePeriod: values.noticePeriod || 'Immediate',
        expectedSalary: Number(values.expectedSalary) || 0,
        source: values.source || 'Recruiter sourced',
        recruiterId: values.recruiterId || actorId,
        skills: values.skills ?? [],
        tags: values.tags ?? [],
        languages: ['English'],
        experience: values.currentTitle
          ? [{ id: createId('exp'), title: values.currentTitle, company: values.currentCompany || '—', start: '—', end: 'Present', summary: '' }]
          : [],
        education: values.education ? [{ id: createId('edu'), degree: values.education, institution: '', year: '' }] : [],
        notes: values.note ? [{ id: createId('note'), authorId: actorId, text: values.note, at: now, visibility: 'team' }] : [],
        resume,
        createdAt: now,
      }
      dataStore.write('candidates', (list) => [created, ...list])
      let application: Application | null = null
      if (values.jobId) {
        application = newApplication({ candidateId: id, jobId: values.jobId, source: created.source })
        dataStore.write('applications', (list) => [application as Application, ...list])
      }
      logActivity({
        type: 'application',
        text: `${created.firstName} ${created.lastName} was added as a candidate`,
        actorId,
        candidateId: id,
        jobId: values.jobId || null,
      })
      return { candidate: created, app: application }
    })
    if (app) await publishApplicationCreated(app, actorId)
    return candidate
  },

  async update(id: string, patch: Partial<CandidateInput>, { actorId }: Ctx) {
    return mockRequest(() => {
      const candidates = dataStore.read('candidates')
      if (patch.email && candidates.some((c) => c.id !== id && normEmail(c.email) === normEmail(patch.email as string)))
        throw new ServiceError('Another candidate already uses this email')
      let updated: Candidate | undefined
      dataStore.write('candidates', (list) =>
        list.map((c) => {
          if (c.id !== id) return c
          updated = {
            ...c,
            ...(patch as Partial<Candidate>),
            experienceYears: Number(patch.experienceYears ?? c.experienceYears),
            expectedSalary: Number(patch.expectedSalary ?? c.expectedSalary),
          }
          return updated
        }),
      )
      if (!updated) throw new ServiceError('Candidate not found', 'not-found')
      logActivity({ type: 'candidate', text: `Profile updated for ${updated.firstName} ${updated.lastName}`, actorId, candidateId: id })
      return updated
    })
  },

  async setTags(id: string, tags: string[], { actorId }: Ctx) {
    const clean = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))).slice(0, 12)
    return mockRequest(
      () => {
        dataStore.write('candidates', (list) => list.map((c) => (c.id === id ? { ...c, tags: clean } : c)))
        logActivity({ type: 'candidate', text: `Tags updated: ${clean.join(', ') || 'none'}`, actorId, candidateId: id })
        return clean
      },
      { latency: 150 },
    )
  },

  /** Adds a note. Mentioned teammates are notified; `restricted` notes are hidden from interviewers and hiring managers. */
  async addNote(candidateId: string, text: string, { actorId, visibility = 'team' }: Ctx & { visibility?: CandidateNote['visibility'] }) {
    if (text.trim().length < 3) throw new ServiceError('Write at least a few characters')
    return mockRequest(
      () => {
        const users = dataStore.read('users')
        const mentions = parseMentions(text, users).filter((u) => u !== actorId)
        const note: CandidateNote = { id: createId('note'), authorId: actorId, text: text.trim(), at: new Date().toISOString(), visibility, mentions }
        dataStore.write('candidates', (list) => list.map((c) => (c.id === candidateId ? { ...c, notes: [note, ...c.notes] } : c)))
        const author = users.find((u) => u.id === actorId)?.name ?? 'A teammate'
        mentions.forEach((userId) =>
          pushNotification({ type: 'mention', title: `${author} mentioned you`, body: text.trim().slice(0, 140), link: `/candidates/${candidateId}`, userId }),
        )
        logActivity({ type: 'note', text: visibility === 'restricted' ? 'Restricted note added' : 'Recruiter note added', actorId, candidateId })
        return note
      },
      { latency: 200 },
    )
  },

  /** Uploads (or replaces) the resume and keeps the previous file out of storage. */
  async attachResume(candidateId: string, file: File, { actorId }: Ctx) {
    const previous = dataStore.read('candidates').find((c) => c.id === candidateId)?.resume
    const resume = await fileStorage.upload(file, 'resumes', ['pdf', 'doc', 'docx'])
    dataStore.write('candidates', (list) => list.map((c) => (c.id === candidateId ? { ...c, resume } : c)))
    if (previous?.fileId) await fileStorage.remove(previous).catch(() => undefined)
    logActivity({ type: 'candidate', text: `Resume uploaded (${resume.fileName})`, actorId, candidateId })
    return resume
  },

  async addApplication(candidateId: string, jobId: string, { actorId }: Ctx) {
    const app = await mockRequest(() => {
      const created = newApplication({ candidateId, jobId, source: 'recruiter' })
      dataStore.write('applications', (list) => [created, ...list])
      const job = dataStore.read('jobs').find((j) => j.id === jobId)
      logActivity({ type: 'application', text: `Added to vacancy ${job?.title ?? ''}`, actorId, candidateId, jobId })
      return created
    })
    await publishApplicationCreated(app, actorId)
    return app
  },

  /**
   * Permanently erases a candidate and everything linked to them (data-subject
   * deletion). The audit log keeps a record that an erasure happened, without personal data.
   */
  async erase(candidateId: string, { actorId }: Ctx) {
    const candidate = dataStore.read('candidates').find((c) => c.id === candidateId)
    if (!candidate) throw new ServiceError('Candidate not found', 'not-found')
    const appIds = new Set(
      dataStore
        .read('applications')
        .filter((a) => a.candidateId === candidateId)
        .map((a) => a.id),
    )
    const interviewIds = new Set(
      dataStore
        .read('interviews')
        .filter((i) => i.candidateId === candidateId)
        .map((i) => i.id),
    )
    const plans = dataStore.read('onboardingPlans').filter((p) => p.candidateId === candidateId)
    const files = [candidate.resume, ...plans.flatMap((p) => p.tasks.map((t) => t.document))].filter((f): f is NonNullable<typeof f> => Boolean(f?.fileId))
    await Promise.all(files.map((f) => fileStorage.remove(f).catch(() => undefined)))
    return mockRequest(() => {
      dataStore.write('interviewFeedback', (l) => l.filter((f) => !interviewIds.has(f.interviewId)))
      dataStore.write('interviews', (l) => l.filter((i) => i.candidateId !== candidateId))
      dataStore.write('assessments', (l) => l.filter((a) => a.candidateId !== candidateId))
      dataStore.write('offers', (l) => l.filter((o) => o.candidateId !== candidateId))
      dataStore.write('onboardingPlans', (l) => l.filter((p) => p.candidateId !== candidateId))
      dataStore.write('tasks', (l) => l.filter((t) => t.candidateId !== candidateId && !(t.applicationId && appIds.has(t.applicationId))))
      dataStore.write('talentPools', (l) =>
        l.map((p) => (p.candidateIds.includes(candidateId) ? { ...p, candidateIds: p.candidateIds.filter((id) => id !== candidateId) } : p)),
      )
      dataStore.write('applications', (l) => l.filter((a) => a.candidateId !== candidateId))
      dataStore.write('activities', (l) => l.filter((a) => a.candidateId !== candidateId))
      dataStore.write('candidates', (l) => l.filter((c) => c.id !== candidateId))
      logActivity({ type: 'privacy', text: `Candidate record ${candidate.ref} erased on request`, actorId })
      return true
    })
  },
}
