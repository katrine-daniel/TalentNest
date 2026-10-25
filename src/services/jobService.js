import { mockDb } from './mockDb'
import { mockRequest, ServiceError } from './apiClient'
import { logActivity } from './activityService'
import { createId } from '@/utils/ids'

function normaliseStages(stages, jobId) {
  return stages.map((s) => ({ id: s.id && !s.id.startsWith('tmp-') ? s.id : `${jobId}-${createId('st')}`, name: s.name.trim(), type: s.type }))
}

function validateStages(stages) {
  if (stages.length < 3) throw new ServiceError('A workflow needs at least three stages')
  if (stages[0].type !== 'application') throw new ServiceError('The first stage must be an application stage')
  if (stages[stages.length - 1].type !== 'hired') throw new ServiceError('The last stage must be a Hired stage')
  if (stages.some((s) => !s.name.trim())) throw new ServiceError('Every stage needs a name')
}

export const jobService = {
  async create(values, { actorId }) {
    return mockRequest(() => {
      validateStages(values.stages)
      const id = createId('job')
      const job = {
        ...values,
        id,
        openings: Number(values.openings),
        experienceMin: Number(values.experienceMin),
        experienceMax: Number(values.experienceMax),
        salaryMin: Number(values.salaryMin) || 0,
        salaryMax: Number(values.salaryMax) || 0,
        stages: normaliseStages(values.stages, id),
        createdAt: new Date().toISOString(),
      }
      mockDb.write('jobs', (list) => [job, ...list])
      logActivity({ type: 'job', text: `Vacancy created: ${job.title}`, actorId, jobId: id })
      return job
    }, { latency: 450 })
  },

  async update(id, values, { actorId }) {
    return mockRequest(() => {
      const current = mockDb.read('jobs').find((j) => j.id === id)
      if (!current) throw new ServiceError('Vacancy not found', 'not-found')
      let stages = current.stages
      if (values.stages) {
        validateStages(values.stages)
        stages = normaliseStages(values.stages, id)
        const keep = new Set(stages.map((s) => s.id))
        const blocked = mockDb.read('applications').filter((a) => a.jobId === id && !keep.has(a.stageId))
        if (blocked.length) {
          throw new ServiceError(`${blocked.length} candidate(s) are in a stage you removed. Move them before deleting that stage.`)
        }
      }
      const updated = {
        ...current,
        ...values,
        openings: Number(values.openings ?? current.openings),
        experienceMin: Number(values.experienceMin ?? current.experienceMin),
        experienceMax: Number(values.experienceMax ?? current.experienceMax),
        salaryMin: Number(values.salaryMin ?? current.salaryMin),
        salaryMax: Number(values.salaryMax ?? current.salaryMax),
        stages,
      }
      mockDb.write('jobs', (list) => list.map((j) => (j.id === id ? updated : j)))
      logActivity({ type: 'job', text: `Vacancy updated: ${updated.title}`, actorId, jobId: id })
      return updated
    }, { latency: 400 })
  },

  async setStatus(id, status, { actorId }) {
    return mockRequest(() => {
      let updated
      mockDb.write('jobs', (list) => list.map((j) => (j.id === id ? (updated = { ...j, status }) : j)))
      logActivity({ type: 'job', text: `${updated.title} marked as ${status.replace('-', ' ')}`, actorId, jobId: id })
      return updated
    }, { latency: 220 })
  },
}
