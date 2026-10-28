import { mockDb } from '@/services/storage/mockDb'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, pushNotification } from '@/services/activityService'
import { createId, nextCandidateRef } from '@/utils/ids'

// Mock implementations. Replace each body with http('/candidates', …) when the backend exists.

function newApplication({ candidateId, jobId, source }) {
  const job = mockDb.read('jobs').find((j) => j.id === jobId)
  if (!job) throw new ServiceError('Vacancy not found')
  if (job.status === 'closed') throw new ServiceError('This vacancy is closed for applications')
  const exists = mockDb.read('applications').some((a) => a.candidateId === candidateId && a.jobId === jobId)
  if (exists) throw new ServiceError('Candidate has already applied to this vacancy')
  const now = new Date().toISOString()
  const id = createId('app')
  return {
    id,
    candidateId,
    jobId,
    stageId: job.stages[0].id,
    status: 'active',
    rating: null,
    appliedAt: now,
    updatedAt: now,
    history: [{ id: `${id}-h0`, kind: 'applied', fromStageId: null, toStageId: job.stages[0].id, at: now, byId: null, note: `Added via ${source || 'recruiter'}` }],
  }
}

export const candidateService = {
  async create(values, { actorId }) {
    return mockRequest(() => {
      const candidates = mockDb.read('candidates')
      if (candidates.some((c) => c.email.toLowerCase() === values.email.toLowerCase())) {
        throw new ServiceError('A candidate with this email already exists')
      }
      const id = createId('cand')
      const candidate = {
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
        languages: ['English'],
        experience: values.currentTitle
          ? [{ id: createId('exp'), title: values.currentTitle, company: values.currentCompany || '—', start: '—', end: 'Present', summary: '' }]
          : [],
        education: values.education ? [{ id: createId('edu'), degree: values.education, institution: '', year: '' }] : [],
        notes: values.note ? [{ id: createId('note'), authorId: actorId, text: values.note, at: new Date().toISOString() }] : [],
        resume: values.resume ?? null,
        createdAt: new Date().toISOString(),
      }
      mockDb.write('candidates', (list) => [candidate, ...list])
      if (values.jobId) {
        const app = newApplication({ candidateId: id, jobId: values.jobId, source: candidate.source })
        mockDb.write('applications', (list) => [app, ...list])
      }
      logActivity({ type: 'application', text: `${candidate.firstName} ${candidate.lastName} was added as a candidate`, actorId, candidateId: id, jobId: values.jobId || null })
      return candidate
    })
  },

  async update(id, patch, { actorId }) {
    return mockRequest(() => {
      const candidates = mockDb.read('candidates')
      if (patch.email && candidates.some((c) => c.id !== id && c.email.toLowerCase() === patch.email.toLowerCase())) {
        throw new ServiceError('Another candidate already uses this email')
      }
      let updated
      mockDb.write('candidates', (list) =>
        list.map((c) => {
          if (c.id !== id) return c
          updated = { ...c, ...patch, experienceYears: Number(patch.experienceYears ?? c.experienceYears), expectedSalary: Number(patch.expectedSalary ?? c.expectedSalary) }
          return updated
        }),
      )
      if (!updated) throw new ServiceError('Candidate not found', 'not-found')
      logActivity({ type: 'candidate', text: `Profile updated for ${updated.firstName} ${updated.lastName}`, actorId, candidateId: id })
      return updated
    })
  },

  async addNote(candidateId, text, { actorId }) {
    return mockRequest(() => {
      const note = { id: createId('note'), authorId: actorId, text: text.trim(), at: new Date().toISOString() }
      mockDb.write('candidates', (list) => list.map((c) => (c.id === candidateId ? { ...c, notes: [note, ...c.notes] } : c)))
      logActivity({ type: 'note', text: 'Recruiter note added', actorId, candidateId })
      return note
    }, { latency: 200 })
  },

  /**
   * Demo: stores only file metadata. A real implementation would upload the file
   * to object storage via a signed URL and save the returned reference.
   */
  async attachResume(candidateId, file, { actorId }) {
    return mockRequest(() => {
      const resume = { fileName: file.name, size: file.size, uploadedAt: new Date().toISOString() }
      mockDb.write('candidates', (list) => list.map((c) => (c.id === candidateId ? { ...c, resume } : c)))
      logActivity({ type: 'candidate', text: `Resume uploaded (${file.name})`, actorId, candidateId })
      return resume
    }, { latency: 900 })
  },

  async addApplication(candidateId, jobId, { actorId }) {
    return mockRequest(() => {
      const app = newApplication({ candidateId, jobId, source: 'recruiter' })
      mockDb.write('applications', (list) => [app, ...list])
      const job = mockDb.read('jobs').find((j) => j.id === jobId)
      logActivity({ type: 'application', text: `Added to vacancy ${job.title}`, actorId, candidateId, jobId })
      pushNotification({ type: 'application', title: 'Candidate added to vacancy', body: `A candidate was added to ${job.title}.`, link: `/candidates/${candidateId}` })
      return app
    })
  },
}
