import { dataStore } from '@/services/storage/dataStore'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity, candidateName, pushNotification } from '@/services/activityService'
import { eventBus } from '@/services/events/eventBus'
import { createId } from '@/utils/ids'
import { formatDateTime } from '@/utils/formatDate'
import { scorecardForStage } from '@/data/mockSettings'

/**
 * Interview scheduling. Panelists receive in-app notifications; calendar invites,
 * meeting links and email reminders are NOT sent until those integrations are
 * configured. Use the .ics download to add an interview to any calendar today.
 */

function overlaps(a, b) {
  const aStart = new Date(a.start).getTime()
  const bStart = new Date(b.start).getTime()
  return aStart < bStart + b.durationMin * 60_000 && bStart < aStart + a.durationMin * 60_000
}

function findConflict(candidate, ignoreId) {
  return dataStore
    .read('interviews')
    .find(
      (i) => i.id !== ignoreId && i.status === 'scheduled' && i.interviewerIds.some((id) => candidate.interviewerIds.includes(id)) && overlaps(i, candidate),
    )
}

function patchInterview(id, updater) {
  let updated
  dataStore.write('interviews', (list) => list.map((i) => (i.id === id ? (updated = updater(i)) : i)))
  if (!updated) throw new ServiceError('Interview not found', 'not-found')
  return updated
}

/** In-app notification for every panelist (email delivery needs the notification backend). */
function notifyPanel(interview, body, title) {
  interview.interviewerIds.forEach((userId) => pushNotification({ type: 'interview', title, body, link: `/calendar?event=${interview.id}`, userId }))
}

export const interviewService = {
  async schedule(values, { actorId }) {
    return mockRequest(
      () => {
        const app = dataStore.read('applications').find((a) => a.id === values.applicationId)
        if (!app) throw new ServiceError('Select a candidate application')
        const job = dataStore.read('jobs').find((j) => j.id === app.jobId)
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
          cancelReason: null,
          notes: values.notes ?? '',
          createdById: actorId,
          createdAt: new Date().toISOString(),
        }
        const conflict = findConflict(interview)
        if (conflict && !values.allowConflict) {
          throw new ServiceError(`Interviewer already has "${conflict.stageName}" with ${candidateName(conflict.candidateId)} at that time`, 'conflict')
        }
        dataStore.write('interviews', (list) => [...list, interview])
        logActivity({
          type: 'interview',
          text: `${stage.name} scheduled with ${candidateName(app.candidateId)}`,
          actorId,
          candidateId: app.candidateId,
          jobId: app.jobId,
        })
        notifyPanel(interview, `${stage.name} with ${candidateName(app.candidateId)} on ${formatDateTime(interview.start)}`, 'Interview scheduled')
        return interview
      },
      { latency: 450 },
    )
  },

  async reschedule(id, { start, durationMin, interviewerIds, mode, location, allowConflict }, { actorId }) {
    return mockRequest(
      () => {
        const current = dataStore.read('interviews').find((i) => i.id === id)
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
        notifyPanel(
          updated,
          `${updated.stageName} with ${candidateName(updated.candidateId)} moved to ${formatDateTime(updated.start)}`,
          'Interview rescheduled',
        )
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
      notifyPanel(updated, `${updated.stageName} with ${candidateName(updated.candidateId)} was cancelled: ${reason}`, 'Interview cancelled')
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

  /**
   * Saves the signed-in interviewer's scorecard. `submit: false` keeps a private draft.
   * Only panel members can write feedback for an interview; a submitted scorecard is final.
   */
  async saveFeedback(interviewId, values, { actorId, submit }) {
    const result = await mockRequest(
      () => {
        const interview = dataStore.read('interviews').find((i) => i.id === interviewId)
        if (!interview) throw new ServiceError('Interview not found', 'not-found')
        if (!interview.interviewerIds.includes(actorId)) throw new ServiceError('Only interviewers on the panel can submit feedback for this interview')
        if (interview.status === 'cancelled') throw new ServiceError('Feedback cannot be added to a cancelled interview')
        const existing = dataStore.read('interviewFeedback').find((f) => f.interviewId === interviewId && f.interviewerId === actorId)
        if (existing?.status === 'submitted') throw new ServiceError('You have already submitted feedback for this interview')
        if (submit) {
          // Every criterion on the interview's scorecard must be rated 1–5.
          const scorecard = dataStore.read('scorecards').find((s) => s.id === interview.scorecardId)
          const criteria = scorecard?.criteria ?? []
          const missing = criteria.some((c) => !(values.ratings?.[c.id] >= 1 && values.ratings?.[c.id] <= 5))
          if (missing || !values.recommendation) throw new ServiceError('Rate every criterion and choose a recommendation before submitting')
        }
        const now = new Date().toISOString()
        const record = {
          id: existing?.id ?? `fb-${interviewId}-${actorId}`,
          interviewId,
          interviewerId: actorId,
          status: submit ? 'submitted' : 'draft',
          ratings: values.ratings ?? {},
          evidence: values.evidence ?? {},
          recommendation: values.recommendation || null,
          strengths: values.strengths ?? '',
          concerns: values.concerns ?? '',
          summary: values.summary ?? '',
          updatedAt: now,
          submittedAt: submit ? now : null,
        }
        dataStore.write('interviewFeedback', (list) => (existing ? list.map((f) => (f.id === existing.id ? record : f)) : [...list, record]))
        if (submit) {
          if (interview.status === 'scheduled') patchInterview(interviewId, (i) => ({ ...i, status: 'completed', attendance: 'attended' }))
          logActivity({
            type: 'feedback',
            text: `Feedback submitted for ${candidateName(interview.candidateId)} — ${interview.stageName}`,
            actorId,
            candidateId: interview.candidateId,
            jobId: interview.jobId,
          })
        }
        const all = dataStore.read('interviewFeedback').filter((f) => f.interviewId === interviewId && f.status === 'submitted')
        const complete = interview.interviewerIds.every((uid) => all.some((f) => f.interviewerId === uid))
        return { record, interview, complete }
      },
      { latency: 350 },
    )
    if (submit && result.complete) {
      await eventBus.publish({
        type: 'interview.completed',
        entityId: interviewId,
        actorId,
        context: {
          interviewId,
          applicationId: result.interview.applicationId,
          candidateId: result.interview.candidateId,
          jobId: result.interview.jobId,
          stageId: result.interview.stageId,
        },
      })
    }
    return result.record
  },
}
