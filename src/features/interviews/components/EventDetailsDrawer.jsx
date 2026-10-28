import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, CalendarClock, CalendarX2, ClipboardCheck, Clock, MapPin, MessageSquarePlus, Users } from 'lucide-react'
import Drawer from '@/components/ui/Drawer'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import StatusBadge from '@/components/ui/StatusBadge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import MockNotice from '@/components/ui/MockNotice'
import { Select } from '@/components/ui/FormControls'
import FeedbackSummary from './FeedbackSummary'
import InterviewFeedbackForm from './InterviewFeedbackForm'
import { useSchedulingActions } from '@/features/interviews/hooks/useScheduling'
import { useGlobalActions } from '@/app/providers/GlobalActionsContext'
import { useSession } from '@/app/providers/SessionContext'
import { formatDateTime, formatRelative, formatTime, toInputDate, addDays } from '@/utils/formatDate'
import { toOptions, EVENT_ACCENTS } from '@/utils/statusHelpers'
import { combineDateTime } from '@/utils/formatDate'

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3">
      <Icon size={16} className="text-faint mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="text-xxs text-faint">{label}</p>
        <div className="text-ink-soft">{children}</div>
      </div>
    </div>
  )
}

/** Details and actions for a calendar event (interview or assessment deadline). */
export default function EventDetailsDrawer({ event, onClose }) {
  const actions = useSchedulingActions()
  const global = useGlobalActions()
  const { can } = useSession()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const interview = event?.interview
  const assessment = event?.assessment
  const canSchedule = can('interviews.schedule')

  return (
    <>
      <Drawer
        open={Boolean(event)}
        onClose={onClose}
        size="md"
        title={event?.title ?? ''}
        subtitle={
          event && (
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${EVENT_ACCENTS[event.accent].dot}`} />
              {EVENT_ACCENTS[event.accent].label}
            </span>
          )
        }
        footer={
          interview && interview.status === 'scheduled' ? (
            <>
              <Button variant="danger-ghost" icon={CalendarX2} onClick={() => setCancelOpen(true)} disabled={!canSchedule}>
                Cancel interview
              </Button>
              <Button
                variant="primary"
                icon={CalendarClock}
                disabled={!canSchedule}
                onClick={() => {
                  global.openSchedule({ interview })
                  onClose()
                }}
              >
                Reschedule
              </Button>
            </>
          ) : interview && interview.status === 'completed' ? (
            <Button variant="primary" icon={MessageSquarePlus} onClick={() => setFeedbackOpen(true)} disabled={!can('feedback.submit')}>
              {interview.feedback ? 'Edit feedback' : 'Add feedback'}
            </Button>
          ) : null
        }
      >
        {event && (
          <div className="space-y-6 p-5">
            <Link
              to={`/candidates/${event.candidate?.id}`}
              onClick={onClose}
              className="border-line hover:bg-subtle flex items-center gap-3 rounded-lg border p-3"
            >
              <Avatar name={event.candidateName} size="md" />
              <div className="min-w-0">
                <p className="truncate font-medium">{event.candidateName}</p>
                <p className="text-muted truncate text-xs">{event.job?.title}</p>
              </div>
            </Link>

            {interview && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="interview" value={interview.status} />
                  <StatusBadge kind="attendance" value={interview.attendance} />
                  {interview.reminderSentAt && (
                    <StatusBadge tone="brand" dot={false}>
                      <BellRing size={11} aria-hidden /> Reminder {formatRelative(interview.reminderSentAt)}
                    </StatusBadge>
                  )}
                </div>
                <div className="space-y-4">
                  <Row icon={Clock} label="When">
                    {formatDateTime(interview.start)} – {formatTime(event.end)} ({interview.durationMin} min)
                  </Row>
                  <Row icon={MapPin} label={interview.mode}>
                    {interview.location || '—'}
                  </Row>
                  <Row icon={Users} label="Panel">
                    <ul className="mt-1 space-y-1.5">
                      {event.interviewers.map((u) => (
                        <li key={u.id} className="flex items-center gap-2">
                          <Avatar name={u.name} size="xs" />
                          <span>{u.name}</span>
                          <span className="text-faint text-xs">{u.title}</span>
                        </li>
                      ))}
                    </ul>
                  </Row>
                </div>
                {interview.notes && <p className="bg-subtle text-ink-soft rounded-lg px-3 py-2 text-sm">{interview.notes}</p>}
                {interview.cancelReason && <p className="text-muted text-sm">Cancelled: {interview.cancelReason}</p>}

                {interview.status !== 'cancelled' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="attendance" className="text-ink-soft mb-1.5 block text-xs font-medium">
                        Candidate attendance
                      </label>
                      <Select
                        id="attendance"
                        value={interview.attendance}
                        disabled={!canSchedule || actions.setAttendance.pending}
                        onChange={(e) => actions.setAttendance.run(interview.id, e.target.value)}
                        options={toOptions('attendance')}
                      />
                    </div>
                    {interview.status === 'scheduled' && (
                      <div className="flex items-end">
                        <Button
                          className="w-full"
                          icon={BellRing}
                          loading={actions.sendReminder.pending}
                          disabled={!canSchedule}
                          onClick={() => actions.sendReminder.run(interview.id)}
                        >
                          {interview.reminderSentAt ? 'Send again' : 'Send reminder'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {interview.status === 'scheduled' && (
                  <MockNotice>Reminders and calendar updates are recorded but not delivered until email/calendar integrations are connected.</MockNotice>
                )}

                {interview.feedback && (
                  <section>
                    <h3 className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">Feedback</h3>
                    <FeedbackSummary interview={interview} />
                  </section>
                )}
                {interview.status === 'completed' && !interview.feedback && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Feedback is pending for this interview.</p>
                )}
              </>
            )}

            {assessment && (
              <>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge kind="assessment" value={assessment.status} />
                </div>
                <Row icon={ClipboardCheck} label="Deadline">
                  {formatDateTime(assessment.deadline)} ({formatRelative(assessment.deadline)})
                </Row>
                <div className="flex flex-wrap gap-2">
                  <Button
                    icon={BellRing}
                    loading={actions.remindAssessment.pending}
                    disabled={!canSchedule}
                    onClick={() => actions.remindAssessment.run(assessment.id)}
                  >
                    Send reminder
                  </Button>
                  <Button
                    disabled={!canSchedule}
                    loading={actions.extendDeadline.pending}
                    onClick={() =>
                      actions.extendDeadline.run(
                        assessment.id,
                        combineDateTime(toInputDate(addDays(new Date(Math.max(Date.now(), new Date(assessment.deadline).getTime())), 2)), '18:00'),
                      )
                    }
                  >
                    Extend by 2 days
                  </Button>
                  <Button variant="ghost" to="/assessments" onClick={onClose}>
                    Open assessments
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this interview?"
        description="The slot is released for the panel. In demo mode no cancellation email is sent to the candidate."
        confirmLabel="Cancel interview"
        tone="danger"
        reasonLabel="Reason"
        requireReason
        loading={actions.cancel.pending}
        onConfirm={async (reason) => {
          const res = await actions.cancel.run(interview.id, reason)
          if (res.ok) setCancelOpen(false)
        }}
      />
      <InterviewFeedbackForm open={feedbackOpen} onClose={() => setFeedbackOpen(false)} interview={interview} />
    </>
  )
}
