import { mockDb } from '@/services/storage/mockDb'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, candidateName } from '@/services/activityService'
import { createId } from '@/utils/ids'
import { scorecardForStage } from '@/data/mockSettings'

/**
 * Interview scheduling (mock). Calendar invites, meeting links and email reminders
 * are NOT sent — those integrations plug in here once a backend is available.
 */

function overlaps(a, b) {
  const aStart = new Date(a.start).getTime()
  const bStart = new Date(b.start).getTime()
  return aStart < bStart + b.durationMin * 60_000 && bStart < aStart + a.durationMin * 60_000
}

function findConflict(candidate, ignoreId) {
  return mockDb
    .read('interviews')
    .find(
      (i) => i.id !== ignoreId && i.status === 'scheduled' && i.interviewerIds.some((id) => candidate.interviewerIds.includes(id)) && overlaps(i, candidate),
    )
}

function patchInterview(id, updater) {
  let updated
  mockDb.write('interviews', (list) => list.map((i) => (i.id === id ? (updated = updater(i)) : i)))
  if (!updated) throw new ServiceError('Interview not found', 'not-found')
  return updated
}

export const interviewService = {
  async schedule(values, { actorId }) {
    return mockRequest(
      () => {
        const app = mockDb.read('applications').find((a) => a.id === values.applicationId)
        if (!app) throw new ServiceError('Select a candidate application')
        const job = mockDb.read('jobs').find((j) => j.id === app.jobId)
        const stage = job.stages.find((s) => s.id === values.stageId)
        const interview = {
          id: createId('int'),
          applicationId: app.id,
          candidateId: app.candidateId,
          jobId: app.jobId,
          stageId: stage.id,
          stageName: stage.name,
          start: values.start,
          durationMin: Number(values.durationMin),
          interviewerIds: values.interviewerIds,
          mode: values.mode,
          location: values.location || (values.mode === 'Video' ? 'Video call — link added when calendar integration is connected' : ''),
          scorecardId: values.scorecardId || scorecardForStage(stage.name),
          status: 'scheduled',
          attendance: 'pending',
          reminderSentAt: null,
          feedback: null,
          cancelReason: null,
          notes: values.notes ?? '',
          createdById: actorId,
          createdAt: new Date().toISOString(),
        }
        const conflict = findConflict(interview)
        if (conflict && !values.allowConflict) {
          throw new ServiceError(`Interviewer already has "${conflict.stageName}" with ${candidateName(conflict.candidateId)} at that time`, 'conflict')
        }
        mockDb.write('interviews', (list) => [...list, interview])
        logActivity({
          type: 'interview',
          text: `${stage.name} scheduled with ${candidateName(app.candidateId)}`,
          actorId,
          candidateId: app.candidateId,
          jobId: app.jobId,
        })
        return interview
      },
      { latency: 450 },
    )
  },

  async reschedule(id, { start, durationMin, interviewerIds, mode, location, allowConflict }, { actorId }) {
    return mockRequest(
      () => {
        const current = mockDb.read('interviews').find((i) => i.id === id)
        const next = {
          ...current,
          start,
          durationMin: Number(durationMin),
          interviewerIds: interviewerIds ?? current.interviewerIds,
          mode: mode ?? current.mode,
          location: location ?? current.location,
        }
        const conflict = findConflict(next, id)
        if (conflict && !allowConflict) {
          throw new ServiceError(`Interviewer already has "${conflict.stageName}" with ${candidateName(conflict.candidateId)} at that time`, 'conflict')
        }
        const updated = patchInterview(id, () => ({ ...next, status: 'scheduled', attendance: 'pending' }))
        logActivity({
          type: 'interview',
          text: `${updated.stageName} rescheduled for ${candidateName(updated.candidateId)}`,
          actorId,
          candidateId: updated.candidateId,
          jobId: updated.jobId,
        })
        return updated
      },
      { latency: 400 },
    )
  },

  async cancel(id, reason, { actorId }) {
    return mockRequest(() => {
      const updated = patchInterview(id, (i) => ({ ...i, status: 'cancelled', cancelReason: reason }))
      logActivity({
        type: 'interview',
        text: `${updated.stageName} with ${candidateName(updated.candidateId)} was cancelled`,
        actorId,
        candidateId: updated.candidateId,
        jobId: updated.jobId,
      })
      return updated
    })
  },

  async setAttendance(id, attendance, { actorId }) {
    return mockRequest(
      () => {
        const updated = patchInterview(id, (i) => ({
          ...i,
          attendance,
          status: attendance === 'no-show' ? 'no-show' : attendance === 'attended' ? 'completed' : i.status,
        }))
        logActivity({
          type: 'interview',
          text: `Attendance marked "${attendance}" for ${candidateName(updated.candidateId)}`,
          actorId,
          candidateId: updated.candidateId,
          jobId: updated.jobId,
        })
        return updated
      },
      { latency: 200 },
    )
  },

  /** Demo: records that a reminder was requested. No email or SMS is sent. */
  async sendReminder(id) {
    return mockRequest(() => patchInterview(id, (i) => ({ ...i, reminderSentAt: new Date().toISOString() })), { latency: 300 })
  },

  async submitFeedback(id, feedback, { actorId }) {
    return mockRequest(
      () => {
        const updated = patchInterview(id, (i) => ({
          ...i,
          status: 'completed',
          attendance: 'attended',
          feedback: { ...feedback, submittedById: actorId, submittedAt: new Date().toISOString() },
        }))
        logActivity({
          type: 'feedback',
          text: `Feedback submitted for ${candidateName(updated.candidateId)} — ${updated.stageName}`,
          actorId,
          candidateId: updated.candidateId,
          jobId: updated.jobId,
        })
        return updated
      },
      { latency: 450 },
    )
  },
}
