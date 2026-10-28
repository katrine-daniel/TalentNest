import { mockDb } from '@/services/storage/mockDb'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, candidateName } from '@/services/activityService'
import { pipelineService } from '@/features/pipeline/pipelineService'
import { createId } from '@/utils/ids'
import { onboardingChecklist } from '@/data/mockOffers'

function patchOffer(id, updater) {
  let updated
  mockDb.write('offers', (list) => list.map((o) => (o.id === id ? (updated = updater(o)) : o)))
  if (!updated) throw new ServiceError('Offer not found', 'not-found')
  return updated
}

export const offerService = {
  async create(values, { actorId }) {
    return mockRequest(
      () => {
        const app = mockDb.read('applications').find((a) => a.id === values.applicationId)
        if (!app) throw new ServiceError('Select a candidate application')
        const open = mockDb.read('offers').some((o) => o.applicationId === app.id && ['draft', 'sent', 'negotiating', 'accepted'].includes(o.status))
        if (open) throw new ServiceError('This application already has an active offer')
        const id = createId('off')
        const now = new Date().toISOString()
        const offer = {
          id,
          applicationId: app.id,
          candidateId: app.candidateId,
          jobId: app.jobId,
          salary: Number(values.salary),
          joiningBonus: Number(values.joiningBonus) || 0,
          startDate: values.startDate,
          expiresAt: values.expiresAt,
          status: values.send ? 'sent' : 'draft',
          sentAt: values.send ? now : null,
          respondedAt: null,
          notes: values.notes ?? '',
          createdAt: now,
          createdById: actorId,
          onboarding: onboardingChecklist(id, 0),
        }
        mockDb.write('offers', (list) => [offer, ...list])
        logActivity({
          type: 'offer',
          text: values.send ? `Offer sent to ${candidateName(app.candidateId)}` : `Offer drafted for ${candidateName(app.candidateId)}`,
          actorId,
          candidateId: app.candidateId,
          jobId: app.jobId,
        })
        return offer
      },
      { latency: 450 },
    )
  },

  async update(id, patch, { actorId }) {
    return mockRequest(() => {
      const updated = patchOffer(id, (o) => ({ ...o, ...patch, salary: Number(patch.salary ?? o.salary) }))
      logActivity({
        type: 'offer',
        text: `Offer revised for ${candidateName(updated.candidateId)}`,
        actorId,
        candidateId: updated.candidateId,
        jobId: updated.jobId,
      })
      return updated
    })
  },

  /**
   * Records a status change. Accepting an offer also moves the application to the
   * vacancy's Hired stage so the pipeline stays consistent.
   */
  async setStatus(id, status, { actorId }) {
    const updated = await mockRequest(() =>
      patchOffer(id, (o) => ({
        ...o,
        status,
        sentAt: status === 'sent' ? (o.sentAt ?? new Date().toISOString()) : o.sentAt,
        respondedAt: ['accepted', 'declined'].includes(status) ? new Date().toISOString() : o.respondedAt,
      })),
    )
    logActivity({
      type: 'offer',
      text: `Offer ${status === 'sent' ? 'sent to' : `${status} by`} ${candidateName(updated.candidateId)}`,
      actorId,
      candidateId: updated.candidateId,
      jobId: updated.jobId,
    })

    if (status === 'accepted') {
      const job = mockDb.read('jobs').find((j) => j.id === updated.jobId)
      const hiredStage = job.stages.find((s) => s.type === 'hired')
      const app = mockDb.read('applications').find((a) => a.id === updated.applicationId)
      if (hiredStage && app && app.stageId !== hiredStage.id && app.status === 'active') {
        await pipelineService.moveStage(app.id, hiredStage.id, { actorId, note: 'Offer accepted' })
      }
    }
    if (status === 'declined') {
      const app = mockDb.read('applications').find((a) => a.id === updated.applicationId)
      if (app && app.status === 'active') await pipelineService.reject(app.id, { actorId, reason: 'Offer declined by candidate.' })
    }
    return updated
  },

  async toggleOnboardingTask(offerId, taskId) {
    return mockRequest(() => patchOffer(offerId, (o) => ({ ...o, onboarding: o.onboarding.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) })), {
      latency: 120,
    })
  },
}
