import { mockDb } from '@/services/storage/mockDb'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, candidateName } from '@/services/activityService'
import { createId } from '@/utils/ids'

/**
 * Assessment assignments (mock). No test link is emailed to the candidate —
 * a real assessment provider integration would issue invitations from here.
 */

function patchAssessment(id, updater) {
  let updated
  mockDb.write('assessments', (list) => list.map((a) => (a.id === id ? (updated = updater(a)) : a)))
  if (!updated) throw new ServiceError('Assessment not found', 'not-found')
  return updated
}

export const assessmentService = {
  async assign(values, { actorId }) {
    return mockRequest(
      () => {
        const app = mockDb.read('applications').find((a) => a.id === values.applicationId)
        if (!app) throw new ServiceError('Select a candidate application')
        const duplicate = mockDb
          .read('assessments')
          .some((a) => a.applicationId === app.id && a.templateId === values.templateId && ['pending', 'in-progress', 'submitted'].includes(a.status))
        if (duplicate) throw new ServiceError('This assessment is already open for the candidate')
        const job = mockDb.read('jobs').find((j) => j.id === app.jobId)
        const stage = job.stages.find((s) => s.type === 'assessment') ?? job.stages.find((s) => s.id === app.stageId)
        const assessment = {
          id: createId('asm'),
          applicationId: app.id,
          candidateId: app.candidateId,
          jobId: app.jobId,
          stageId: stage.id,
          templateId: values.templateId,
          assignedAt: new Date().toISOString(),
          deadline: values.deadline,
          assignedById: actorId,
          status: 'pending',
          score: null,
          completedAt: null,
          reminderSentAt: null,
          notes: values.notes ?? '',
        }
        mockDb.write('assessments', (list) => [assessment, ...list])
        logActivity({
          type: 'assessment',
          text: `Assessment assigned to ${candidateName(app.candidateId)}`,
          actorId,
          candidateId: app.candidateId,
          jobId: app.jobId,
        })
        return assessment
      },
      { latency: 420 },
    )
  },

  async recordScore(id, { score, notes }, { actorId }) {
    return mockRequest(() => {
      const updated = patchAssessment(id, (a) => ({
        ...a,
        status: 'evaluated',
        score: Number(score),
        notes: notes ?? a.notes,
        completedAt: a.completedAt ?? new Date().toISOString(),
        evaluatorId: actorId,
      }))
      logActivity({
        type: 'assessment',
        text: `Assessment evaluated for ${candidateName(updated.candidateId)} (${score}%)`,
        actorId,
        candidateId: updated.candidateId,
        jobId: updated.jobId,
      })
      return updated
    })
  },

  async extendDeadline(id, deadline, { actorId }) {
    return mockRequest(() => {
      const updated = patchAssessment(id, (a) => ({ ...a, deadline, status: a.status === 'expired' ? 'pending' : a.status }))
      logActivity({
        type: 'assessment',
        text: `Assessment deadline extended for ${candidateName(updated.candidateId)}`,
        actorId,
        candidateId: updated.candidateId,
        jobId: updated.jobId,
      })
      return updated
    })
  },

  /** Demo: records that a reminder was requested. Nothing is emailed. */
  async sendReminder(id) {
    return mockRequest(() => patchAssessment(id, (a) => ({ ...a, reminderSentAt: new Date().toISOString() })), { latency: 280 })
  },

  async cancel(id, { actorId }) {
    return mockRequest(() => {
      const updated = patchAssessment(id, (a) => ({ ...a, status: 'cancelled' }))
      logActivity({
        type: 'assessment',
        text: `Assessment cancelled for ${candidateName(updated.candidateId)}`,
        actorId,
        candidateId: updated.candidateId,
        jobId: updated.jobId,
      })
      return updated
    })
  },
}

export function isAssessmentOverdue(a, now = Date.now()) {
  return ['pending', 'in-progress'].includes(a.status) && new Date(a.deadline).getTime() < now
}
