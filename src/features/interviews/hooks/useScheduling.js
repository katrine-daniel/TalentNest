import { useMemo } from 'react'
import { useCollection, useLookups, fullName } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useSession } from '@/app/providers/SessionContext'
import { interviewService } from '@/features/interviews/interviewService'
import { assessmentService, isAssessmentOverdue } from '@/features/assessments/assessmentService'
import { offerService } from '@/features/offers/offerService'
import { interviewAccent } from '@/utils/statusHelpers'

/** Interviews joined with candidate, vacancy and interviewer details. */
export function useInterviewEvents(filters = {}) {
  const interviews = useCollection('interviews')
  const { candidatesById, jobsById, usersById } = useLookups()
  return useMemo(
    () =>
      interviews
        .map((interview) => {
          const job = jobsById.get(interview.jobId)
          return {
            id: interview.id,
            kind: 'interview',
            interview,
            start: interview.start,
            end: new Date(new Date(interview.start).getTime() + interview.durationMin * 60_000).toISOString(),
            title: interview.stageName,
            candidate: candidatesById.get(interview.candidateId),
            candidateName: fullName(candidatesById.get(interview.candidateId)),
            job,
            interviewers: interview.interviewerIds.map((id) => usersById.get(id)).filter(Boolean),
            accent: interviewAccent(interview.stageName),
          }
        })
        .filter((e) => {
          if (!e.job) return false
          if (filters.department && filters.department !== 'all' && e.job.departmentId !== filters.department) return false
          if (filters.interviewer && filters.interviewer !== 'all' && !e.interview.interviewerIds.includes(filters.interviewer)) return false
          if (filters.status && filters.status !== 'all' && e.interview.status !== filters.status) return false
          if (!filters.includeCancelled && e.interview.status === 'cancelled' && filters.status !== 'cancelled') return false
          return true
        }),
    [interviews, candidatesById, jobsById, usersById, filters.department, filters.interviewer, filters.status, filters.includeCancelled],
  )
}

/** Assessment deadlines rendered as calendar markers. */
export function useAssessmentEvents(filters = {}) {
  const rows = useAssessmentRows(filters)
  return useMemo(
    () =>
      rows
        .filter((r) => ['pending', 'in-progress'].includes(r.assessment.status))
        .map((r) => ({
          id: r.id,
          kind: 'assessment',
          assessment: r.assessment,
          start: r.assessment.deadline,
          end: r.assessment.deadline,
          title: r.template?.name ?? 'Assessment',
          candidate: r.candidate,
          candidateName: r.candidateName,
          job: r.job,
          interviewers: [],
          accent: 'assessment',
        })),
    [rows],
  )
}

export function useAssessmentRows(filters = {}) {
  const assessments = useCollection('assessments')
  const { candidatesById, jobsById, templatesById, usersById } = useLookups()
  return useMemo(() => {
    const now = Date.now()
    return assessments
      .map((a) => ({
        id: a.id,
        assessment: a,
        candidate: candidatesById.get(a.candidateId),
        candidateName: fullName(candidatesById.get(a.candidateId)),
        job: jobsById.get(a.jobId),
        template: templatesById.get(a.templateId),
        assignedBy: usersById.get(a.assignedById),
        overdue: isAssessmentOverdue(a, now),
        passed: a.status === 'evaluated' && a.score != null ? a.score >= (templatesById.get(a.templateId)?.passMark ?? 60) : null,
      }))
      .filter((r) => {
        if (!r.job) return false
        if (filters.department && filters.department !== 'all' && r.job.departmentId !== filters.department) return false
        if (filters.template && filters.template !== 'all' && r.assessment.templateId !== filters.template) return false
        if (filters.status && filters.status !== 'all') {
          if (filters.status === 'overdue') return r.overdue
          if (r.assessment.status !== filters.status) return false
        }
        if (filters.q) {
          const q = filters.q.toLowerCase()
          if (!r.candidateName.toLowerCase().includes(q) && !r.job.title.toLowerCase().includes(q)) return false
        }
        return true
      })
  }, [assessments, candidatesById, jobsById, templatesById, usersById, filters.department, filters.template, filters.status, filters.q])
}

/** Active applications as select options for scheduling and offer forms. */
export function useApplicationOptions({ stageTypes } = {}) {
  const applications = useCollection('applications')
  const { candidatesById, jobsById } = useLookups()
  return useMemo(
    () =>
      applications
        .filter((a) => a.status === 'active')
        .map((a) => {
          const job = jobsById.get(a.jobId)
          const stage = job?.stages.find((s) => s.id === a.stageId)
          return { a, job, stage, candidate: candidatesById.get(a.candidateId) }
        })
        .filter((x) => x.job && x.candidate && (!stageTypes || stageTypes.includes(x.stage?.type)))
        .sort((x, y) => fullName(x.candidate).localeCompare(fullName(y.candidate)))
        .map(({ a, job, stage, candidate }) => ({ value: a.id, label: `${fullName(candidate)} — ${job.title} (${stage?.name})`, application: a, job, stage, candidate })),
    [applications, candidatesById, jobsById, stageTypes],
  )
}

export function useSchedulingActions() {
  const { actorId } = useSession()
  const ctx = { actorId }
  return {
    schedule: useAsyncAction((values) => interviewService.schedule(values, ctx), { success: 'Interview scheduled (demo — no calendar invite sent)' }),
    reschedule: useAsyncAction((id, values) => interviewService.reschedule(id, values, ctx), { success: 'Interview rescheduled' }),
    cancel: useAsyncAction((id, reason) => interviewService.cancel(id, reason, ctx), { success: 'Interview cancelled' }),
    setAttendance: useAsyncAction((id, attendance) => interviewService.setAttendance(id, attendance, ctx), { success: 'Attendance updated' }),
    sendReminder: useAsyncAction((id) => interviewService.sendReminder(id), { success: 'Reminder recorded (demo — no email sent)' }),
    submitFeedback: useAsyncAction((id, feedback) => interviewService.submitFeedback(id, feedback, ctx), { success: 'Feedback submitted' }),
    assign: useAsyncAction((values) => assessmentService.assign(values, ctx), { success: 'Assessment assigned (demo — no invitation sent)' }),
    recordScore: useAsyncAction((id, values) => assessmentService.recordScore(id, values, ctx), { success: 'Score recorded' }),
    extendDeadline: useAsyncAction((id, deadline) => assessmentService.extendDeadline(id, deadline, ctx), { success: 'Deadline extended' }),
    remindAssessment: useAsyncAction((id) => assessmentService.sendReminder(id), { success: 'Reminder recorded (demo — no email sent)' }),
    cancelAssessment: useAsyncAction((id) => assessmentService.cancel(id, ctx), { success: 'Assessment cancelled' }),
  }
}

export function useOfferActions() {
  const { actorId } = useSession()
  const ctx = { actorId }
  return {
    create: useAsyncAction((values) => offerService.create(values, ctx), { success: (o) => (o.status === 'sent' ? 'Offer marked as sent (demo — nothing emailed)' : 'Offer saved as draft') }),
    update: useAsyncAction((id, patch) => offerService.update(id, patch, ctx), { success: 'Offer updated' }),
    setStatus: useAsyncAction((id, status) => offerService.setStatus(id, status, ctx), { success: (o) => `Offer marked as ${o.status}` }),
    toggleTask: useAsyncAction((offerId, taskId) => offerService.toggleOnboardingTask(offerId, taskId)),
  }
}
