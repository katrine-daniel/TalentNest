import { dataStore } from '@/services/storage/dataStore'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, candidateName } from '@/services/activityService'
import { eventBus } from '@/services/events/eventBus'
import { pipelineService } from '@/features/pipeline/pipelineService'
import { createId } from '@/utils/ids'
import type { Offer } from '@/types/domain'

type OfferStatus = Offer['status']

/** Allowed offer status transitions; anything else is rejected. */
export const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft: ['sent'],
  sent: ['negotiating', 'accepted', 'declined'],
  negotiating: ['sent', 'accepted', 'declined'],
  accepted: [],
  declined: [],
}

function patchOffer(id: string, updater: (o: Offer) => Offer) {
  let updated: Offer | undefined
  dataStore.write('offers', (list) => list.map((o) => (o.id === id ? (updated = updater(o)) : o)))
  if (!updated) throw new ServiceError('Offer not found', 'not-found')
  return updated
}

interface CreateOfferInput {
  applicationId: string
  salary: number | string
  joiningBonus?: number | string
  startDate: string
  expiresAt: string
  notes?: string
  send?: boolean
}

export const offerService = {
  async create(values: CreateOfferInput, { actorId }: { actorId: string }) {
    return mockRequest(
      () => {
        const app = dataStore.read('applications').find((a) => a.id === values.applicationId)
        if (!app) throw new ServiceError('Select a candidate application')
        if (app.status !== 'active') throw new ServiceError('Offers can only be made on active applications')
        const open = dataStore.read('offers').some((o) => o.applicationId === app.id && ['draft', 'sent', 'negotiating', 'accepted'].includes(o.status))
        if (open) throw new ServiceError('This application already has an active offer')
        if (!(Number(values.salary) > 0)) throw new ServiceError('Enter a salary')
        if (new Date(values.expiresAt) < new Date()) throw new ServiceError('The offer expiry must be in the future')
        const now = new Date().toISOString()
        const offer: Offer = {
          id: createId('off'),
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
        }
        dataStore.write('offers', (list) => [offer, ...list])
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

  async update(id: string, patch: Partial<Offer>, { actorId }: { actorId: string }) {
    return mockRequest(() => {
      const updated = patchOffer(id, (o) => {
        if (o.status === 'accepted' || o.status === 'declined') throw new ServiceError('Accepted or declined offers cannot be revised')
        return { ...o, ...patch, salary: Number(patch.salary ?? o.salary) }
      })
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
   * Records a status change. Accepting moves the application to the vacancy's Hired
   * stage and publishes `offer.accepted` (which starts onboarding via automation);
   * declining marks the application as not progressing.
   */
  async setStatus(id: string, status: OfferStatus, { actorId }: { actorId: string }) {
    const updated = await mockRequest(() =>
      patchOffer(id, (o) => {
        if (!OFFER_TRANSITIONS[o.status].includes(status)) throw new ServiceError(`An offer that is ${o.status} cannot be marked as ${status}`)
        return {
          ...o,
          status,
          sentAt: status === 'sent' ? (o.sentAt ?? new Date().toISOString()) : o.sentAt,
          respondedAt: status === 'accepted' || status === 'declined' ? new Date().toISOString() : o.respondedAt,
        }
      }),
    )
    logActivity({
      type: 'offer',
      text: `Offer ${status === 'sent' ? 'sent to' : `${status} by`} ${candidateName(updated.candidateId)}`,
      actorId,
      candidateId: updated.candidateId,
      jobId: updated.jobId,
    })

    if (status === 'accepted') {
      const job = dataStore.read('jobs').find((j) => j.id === updated.jobId)
      const hiredStage = job?.stages.find((s) => s.type === 'hired')
      const app = dataStore.read('applications').find((a) => a.id === updated.applicationId)
      if (hiredStage && app && app.stageId !== hiredStage.id && app.status === 'active') {
        await pipelineService.moveStage(app.id, hiredStage.id, { actorId, note: 'Offer accepted' })
      }
      await eventBus.publish({
        type: 'offer.accepted',
        entityId: updated.id,
        actorId,
        context: { offerId: updated.id, applicationId: updated.applicationId, candidateId: updated.candidateId, jobId: updated.jobId },
      })
    }
    if (status === 'declined') {
      const app = dataStore.read('applications').find((a) => a.id === updated.applicationId)
      if (app && app.status === 'active') await pipelineService.reject(app.id, { actorId, reason: 'Offer declined by candidate.' })
    }
    return updated
  },
}
