import { dataStore } from '@/services/storage/dataStore'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, candidateName } from '@/services/activityService'
import { eventBus } from '@/services/events/eventBus'
import { createId } from '@/utils/ids'
import type { Application } from '@/types/domain'

interface Ctx {
  actorId: string
}

function updateApplication(applicationId: string, updater: (a: Application) => Application): Application {
  let updated: Application | undefined
  dataStore.write('applications', (list) =>
    list.map((a) => {
      if (a.id !== applicationId) return a
      updated = updater(a)
      return updated
    }),
  )
  if (!updated) throw new ServiceError('Application not found', 'not-found')
  return updated
}

/** Business rules for stage transitions, shared by the board, drawer and profile. */
export function assertTransitionAllowed(app: Application, toStageId: string) {
  if (app.status === 'rejected' || app.status === 'withdrawn') throw new ServiceError('Restore this application before moving it')
  const job = dataStore.read('jobs').find((j) => j.id === app.jobId)
  const to = job?.stages.find((s) => s.id === toStageId)
  if (!job || !to) throw new ServiceError('Stage does not belong to this vacancy')
  if (to.type === 'hired') {
    const accepted = dataStore.read('offers').some((o) => o.applicationId === app.id && o.status === 'accepted')
    if (!accepted) throw new ServiceError('Record an accepted offer before marking this candidate as hired')
  }
  return { job, to }
}

export const pipelineService = {
  async moveStage(applicationId: string, toStageId: string, { actorId, note = '' }: Ctx & { note?: string }) {
    const updated = await mockRequest(
      () => {
        const app = dataStore.read('applications').find((a) => a.id === applicationId)
        if (!app) throw new ServiceError('Application not found', 'not-found')
        if (app.stageId === toStageId) return app
        const { job, to } = assertTransitionAllowed(app, toStageId)
        const at = new Date().toISOString()
        const result = updateApplication(applicationId, (a) => ({
          ...a,
          stageId: toStageId,
          status: to.type === 'hired' ? 'hired' : 'active',
          updatedAt: at,
          history: [
            ...a.history,
            { id: createId('h'), kind: to.type === 'hired' ? 'hired' : 'moved', fromStageId: a.stageId, toStageId, at, byId: actorId, note },
          ],
        }))
        logActivity({
          type: 'stage',
          text: to.type === 'hired' ? `${candidateName(app.candidateId)} was hired as ${job.title}` : `${candidateName(app.candidateId)} moved to ${to.name}`,
          actorId,
          candidateId: app.candidateId,
          jobId: app.jobId,
        })
        return result
      },
      { latency: 240 },
    )
    await eventBus.publish({
      type: 'stage.changed',
      entityId: updated.id,
      actorId,
      context: { applicationId: updated.id, candidateId: updated.candidateId, jobId: updated.jobId, stageId: updated.stageId },
    })
    return updated
  },

  async reject(applicationId: string, { actorId, reason }: Ctx & { reason: string }) {
    if (!reason?.trim()) throw new ServiceError('A reason is required')
    return mockRequest(() => {
      const at = new Date().toISOString()
      const updated = updateApplication(applicationId, (a) => {
        if (a.status !== 'active') throw new ServiceError('Only active applications can be marked as not progressing')
        return {
          ...a,
          status: 'rejected',
          updatedAt: at,
          history: [...a.history, { id: createId('h'), kind: 'rejected', fromStageId: a.stageId, toStageId: a.stageId, at, byId: actorId, note: reason }],
        }
      })
      logActivity({
        type: 'stage',
        text: `${candidateName(updated.candidateId)} was not progressed`,
        actorId,
        candidateId: updated.candidateId,
        jobId: updated.jobId,
      })
      return updated
    })
  },

  async restore(applicationId: string, { actorId }: Ctx) {
    return mockRequest(() => {
      const at = new Date().toISOString()
      const updated = updateApplication(applicationId, (a) => ({
        ...a,
        status: 'active',
        updatedAt: at,
        history: [
          ...a.history,
          { id: createId('h'), kind: 'restored', fromStageId: a.stageId, toStageId: a.stageId, at, byId: actorId, note: 'Application restored' },
        ],
      }))
      logActivity({
        type: 'stage',
        text: `${candidateName(updated.candidateId)} was restored to the pipeline`,
        actorId,
        candidateId: updated.candidateId,
        jobId: updated.jobId,
      })
      return updated
    })
  },

  async rate(applicationId: string, rating: number) {
    if (!(rating >= 1 && rating <= 5)) throw new ServiceError('Rating must be between 1 and 5')
    return mockRequest(() => updateApplication(applicationId, (a) => ({ ...a, rating })), { latency: 120 })
  },
}
