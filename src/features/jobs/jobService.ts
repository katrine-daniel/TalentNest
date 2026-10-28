import { dataStore } from '@/services/storage/dataStore'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity } from '@/services/activityService'
import { createId } from '@/utils/ids'
import type { Job, JobStatus, Stage } from '@/types/domain'

type StageInput = Pick<Stage, 'name' | 'type'> & { id?: string }
export type JobInput = Omit<Job, 'id' | 'stages' | 'createdAt'> & { stages: StageInput[] }

function normaliseStages(stages: StageInput[], jobId: string): Stage[] {
  return stages.map((s) => ({ id: s.id && !s.id.startsWith('tmp-') ? s.id : `${jobId}-${createId('st')}`, name: s.name.trim(), type: s.type }))
}

export function validateStages(stages: StageInput[]) {
  if (stages.length < 3) throw new ServiceError('A workflow needs at least three stages')
  if (stages[0]?.type !== 'application') throw new ServiceError('The first stage must be an application stage')
  if (stages[stages.length - 1]?.type !== 'hired') throw new ServiceError('The last stage must be a Hired stage')
  if (stages.some((s) => !s.name.trim())) throw new ServiceError('Every stage needs a name')
}

/**
 * Publishing rule: a vacancy can only be opened from an approved requisition.
 * Drafts can be prepared at any time.
 */
export function assertCanPublish(job: Pick<Job, 'requisitionId' | 'status'>, nextStatus: JobStatus) {
  if (nextStatus !== 'open') return
  const req = job.requisitionId ? dataStore.read('requisitions').find((r) => r.id === job.requisitionId) : undefined
  if (!req) throw new ServiceError('Link an approved requisition before publishing this vacancy')
  if (req.status !== 'approved') throw new ServiceError(`The linked requisition is ${req.status.replace('-', ' ')} — it must be approved before publishing`)
}

function numbers(values: Partial<JobInput>, current?: Job) {
  return {
    openings: Number(values.openings ?? current?.openings),
    experienceMin: Number(values.experienceMin ?? current?.experienceMin),
    experienceMax: Number(values.experienceMax ?? current?.experienceMax),
    salaryMin: Number(values.salaryMin ?? current?.salaryMin) || 0,
    salaryMax: Number(values.salaryMax ?? current?.salaryMax) || 0,
  }
}

function linkRequisition(requisitionId: string | null | undefined, jobId: string, actorId: string) {
  if (!requisitionId) return
  dataStore.write('requisitions', (list) =>
    list.map((r) =>
      r.id === requisitionId && r.jobId !== jobId
        ? {
            ...r,
            jobId,
            updatedAt: new Date().toISOString(),
            history: [
              ...r.history,
              { id: createId('rh'), action: 'linked' as const, byId: actorId, at: new Date().toISOString(), comment: 'Linked to vacancy' },
            ],
          }
        : r,
    ),
  )
}

export const jobService = {
  async create(values: JobInput, { actorId }: { actorId: string }) {
    return mockRequest(
      () => {
        validateStages(values.stages)
        assertCanPublish(values, values.status)
        if (values.requisitionId && dataStore.read('jobs').some((j) => j.requisitionId === values.requisitionId))
          throw new ServiceError('That requisition is already linked to another vacancy')
        const id = createId('job')
        const job: Job = { ...values, ...numbers(values), id, stages: normaliseStages(values.stages, id), createdAt: new Date().toISOString() }
        dataStore.write('jobs', (list) => [job, ...list])
        linkRequisition(job.requisitionId, id, actorId)
        logActivity({ type: 'job', text: `Vacancy created: ${job.title}`, actorId, jobId: id })
        return job
      },
      { latency: 450 },
    )
  },

  async update(id: string, values: Partial<JobInput>, { actorId }: { actorId: string }) {
    return mockRequest(
      () => {
        const current = dataStore.read('jobs').find((j) => j.id === id)
        if (!current) throw new ServiceError('Vacancy not found', 'not-found')
        let stages = current.stages
        if (values.stages) {
          validateStages(values.stages)
          stages = normaliseStages(values.stages, id)
          const keep = new Set(stages.map((s) => s.id))
          const blocked = dataStore.read('applications').filter((a) => a.jobId === id && !keep.has(a.stageId))
          if (blocked.length) throw new ServiceError(`${blocked.length} candidate(s) are in a stage you removed. Move them before deleting that stage.`)
        }
        const merged = { ...current, ...values }
        if (values.status && values.status !== current.status) assertCanPublish(merged, values.status)
        const updated: Job = { ...merged, ...numbers(values, current), stages }
        dataStore.write('jobs', (list) => list.map((j) => (j.id === id ? updated : j)))
        linkRequisition(updated.requisitionId, id, actorId)
        logActivity({ type: 'job', text: `Vacancy updated: ${updated.title}`, actorId, jobId: id })
        return updated
      },
      { latency: 400 },
    )
  },

  async setStatus(id: string, status: JobStatus, { actorId }: { actorId: string }) {
    return mockRequest(
      () => {
        const current = dataStore.read('jobs').find((j) => j.id === id)
        if (!current) throw new ServiceError('Vacancy not found', 'not-found')
        assertCanPublish(current, status)
        const updated = { ...current, status }
        dataStore.write('jobs', (list) => list.map((j) => (j.id === id ? updated : j)))
        logActivity({ type: 'job', text: `${updated.title} marked as ${status.replace('-', ' ')}`, actorId, jobId: id })
        return updated
      },
      { latency: 220 },
    )
  },
}
