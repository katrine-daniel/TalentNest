import { mockDb } from '@/services/storage/mockDb'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, candidateName } from '@/services/activityService'
import { createId } from '@/utils/ids'

function updateApplication(applicationId, updater) {
  let updated
  mockDb.write('applications', (list) =>
    list.map((a) => {
      if (a.id !== applicationId) return a
      updated = updater(a)
      return updated
    }),
  )
  if (!updated) throw new ServiceError('Application not found', 'not-found')
  return updated
}

export const pipelineService = {
  async moveStage(applicationId, toStageId, { actorId, note = '' }) {
    return mockRequest(
      () => {
        const app = mockDb.read('applications').find((a) => a.id === applicationId)
        if (!app) throw new ServiceError('Application not found', 'not-found')
        if (app.stageId === toStageId) return app
        if (app.status === 'rejected' || app.status === 'withdrawn') {
          throw new ServiceError('Restore this application before moving it')
        }
        const job = mockDb.read('jobs').find((j) => j.id === app.jobId)
        const to = job.stages.find((s) => s.id === toStageId)
        if (!to) throw new ServiceError('Stage does not belong to this vacancy')
        const at = new Date().toISOString()
        const updated = updateApplication(applicationId, (a) => ({
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
        return updated
      },
      { latency: 240 },
    )
  },

  async reject(applicationId, { actorId, reason }) {
    return mockRequest(() => {
      const at = new Date().toISOString()
      const updated = updateApplication(applicationId, (a) => ({
        ...a,
        status: 'rejected',
        updatedAt: at,
        history: [...a.history, { id: createId('h'), kind: 'rejected', fromStageId: a.stageId, toStageId: a.stageId, at, byId: actorId, note: reason }],
      }))
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

  async restore(applicationId, { actorId }) {
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

  async rate(applicationId, rating) {
    return mockRequest(() => updateApplication(applicationId, (a) => ({ ...a, rating })), { latency: 120 })
  },
}
