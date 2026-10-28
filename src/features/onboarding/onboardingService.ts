import { dataStore } from '@/services/storage/dataStore'
import { fileStorage } from '@/services/storage/fileStorage'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, candidateName } from '@/services/activityService'
import { createId } from '@/utils/ids'
import type { OnboardingPlan, OnboardingTask } from '@/types/domain'
import { createOnboardingPlan, derivePlanStatus } from './onboardingPlanFactory'

interface Ctx {
  actorId: string
}

function patchPlan(id: string, actorId: string, text: string, updater: (p: OnboardingPlan) => OnboardingPlan) {
  let updated: OnboardingPlan | undefined
  dataStore.write('onboardingPlans', (list) =>
    list.map((p) => {
      if (p.id !== id) return p
      const next = updater(p)
      const status = derivePlanStatus(next)
      updated = {
        ...next,
        status,
        completedAt: status === 'completed' ? (p.completedAt ?? new Date().toISOString()) : null,
        history: [...next.history, { id: createId('oh'), at: new Date().toISOString(), byId: actorId, text }],
      }
      return updated
    }),
  )
  if (!updated) throw new ServiceError('Onboarding plan not found', 'not-found')
  return updated
}

function patchTask(planId: string, taskId: string, actorId: string, text: (t: OnboardingTask) => string, updater: (t: OnboardingTask) => OnboardingTask) {
  const plan = dataStore.read('onboardingPlans').find((p) => p.id === planId)
  const task = plan?.tasks.find((t) => t.id === taskId)
  if (!plan || !task) throw new ServiceError('Task not found', 'not-found')
  return patchPlan(planId, actorId, text(task), (p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === taskId ? updater(t) : t)) }))
}

export const onboardingService = {
  /** Manual start for accepted offers without a plan (e.g. if the automation rule is disabled). */
  async start(offerId: string, templateId: string, { actorId }: Ctx) {
    return mockRequest(() => {
      const offer = dataStore.read('offers').find((o) => o.id === offerId)
      if (!offer || offer.status !== 'accepted') throw new ServiceError('Onboarding can only start after an offer is accepted')
      if (dataStore.read('onboardingPlans').some((p) => p.offerId === offerId)) throw new ServiceError('An onboarding plan already exists for this hire')
      const job = dataStore.read('jobs').find((j) => j.id === offer.jobId)
      const template = dataStore.read('onboardingTemplates').find((t) => t.id === templateId)
      if (!job || !template) throw new ServiceError('Vacancy or checklist template not found')
      const plan = createOnboardingPlan({ template, offer, job, users: dataStore.read('users') })
      dataStore.write('onboardingPlans', (list) => [plan, ...list])
      logActivity({
        type: 'onboarding',
        text: `Onboarding started for ${candidateName(offer.candidateId)}`,
        actorId,
        candidateId: offer.candidateId,
        jobId: offer.jobId,
      })
      return plan
    })
  },

  async toggleTask(planId: string, taskId: string, { actorId }: Ctx) {
    return mockRequest(
      () =>
        patchTask(
          planId,
          taskId,
          actorId,
          (t) => `${t.done ? 'Reopened' : 'Completed'}: ${t.label}`,
          (t) => {
            if (!t.done && t.requiresDocument && !t.document) throw new ServiceError('Upload the required document before completing this task')
            return { ...t, done: !t.done, completedAt: t.done ? null : new Date().toISOString() }
          },
        ),
      { latency: 120 },
    )
  },

  async assignTask(planId: string, taskId: string, { ownerId, dueDate }: { ownerId: string | null; dueDate: string | null }, { actorId }: Ctx) {
    return mockRequest(
      () =>
        patchTask(
          planId,
          taskId,
          actorId,
          (t) => `Updated owner/due date: ${t.label}`,
          (t) => ({ ...t, ownerId, dueDate }),
        ),
      { latency: 150 },
    )
  },

  async addTask(
    planId: string,
    { label, ownerId, dueDate, requiresDocument }: { label: string; ownerId: string | null; dueDate: string | null; requiresDocument: boolean },
    { actorId }: Ctx,
  ) {
    if (!label.trim()) throw new ServiceError('Task name is required')
    return mockRequest(() =>
      patchPlan(planId, actorId, `Added task: ${label.trim()}`, (p) => ({
        ...p,
        tasks: [...p.tasks, { id: createId('obt'), label: label.trim(), ownerId, dueDate, done: false, completedAt: null, requiresDocument, document: null }],
      })),
    )
  },

  /** Stores a document for a task (validated type/size, private storage). */
  async uploadDocument(planId: string, taskId: string, file: File, { actorId }: Ctx) {
    const ref = await fileStorage.upload(file, 'onboarding')
    return patchTask(
      planId,
      taskId,
      actorId,
      (t) => `Document uploaded for: ${t.label}`,
      (t) => ({ ...t, document: ref }),
    )
  },
}
