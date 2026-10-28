import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import MockNotice from '@/components/ui/MockNotice'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import InterviewerPicker from './InterviewerPicker'
import { useApplicationOptions, useSchedulingActions } from '@/features/interviews/hooks/useScheduling'
import { useLookups, fullName } from '@/hooks/useStore'
import { rules } from '@/utils/validation'
import { combineDateTime, toInputDate, toInputTime, addDays } from '@/utils/formatDate'

const DURATIONS = [30, 45, 60, 90].map((d) => ({ value: String(d), label: `${d} minutes` }))
const MODES = [
  { value: 'Video', label: 'Video' },
  { value: 'In person', label: 'In person' },
  { value: 'Phone', label: 'Phone' },
]

function defaultSlot() {
  const d = addDays(new Date(), 1)
  return { date: toInputDate(d), time: '11:00' }
}

/**
 * Schedules a new interview or reschedules an existing one (`interview` prop).
 * `prefill` may contain applicationId, date (yyyy-mm-dd) and time (HH:mm).
 */
export default function ScheduleModal({ open, onClose, interview, prefill }) {
  const isReschedule = Boolean(interview)
  const appOptions = useApplicationOptions()
  const { jobsById, candidatesById } = useLookups()
  const actions = useSchedulingActions()
  const [conflict, setConflict] = useState(null)

  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors } } = useForm({
    defaultValues: { applicationId: '', stageId: '', date: '', time: '', durationMin: '45', interviewerIds: [], mode: 'Video', location: '', notes: '' },
  })

  useEffect(() => {
    if (!open) return
    setConflict(null)
    if (interview) {
      reset({
        applicationId: interview.applicationId,
        stageId: interview.stageId,
        date: toInputDate(interview.start),
        time: toInputTime(interview.start),
        durationMin: String(interview.durationMin),
        interviewerIds: interview.interviewerIds,
        mode: interview.mode,
        location: interview.mode === 'Video' ? '' : interview.location,
        notes: interview.notes ?? '',
      })
    } else {
      const slot = defaultSlot()
      reset({
        applicationId: prefill?.applicationId ?? '',
        stageId: '',
        date: prefill?.date ?? slot.date,
        time: prefill?.time ?? slot.time,
        durationMin: '45',
        interviewerIds: [],
        mode: 'Video',
        location: '',
        notes: '',
      })
    }
  }, [open, interview, prefill, reset])

  const applicationId = watch('applicationId')
  const mode = watch('mode')
  const selected = appOptions.find((o) => o.value === applicationId)
  const job = selected?.job ?? (interview ? jobsById.get(interview.jobId) : null)

  const stageOptions = useMemo(() => (job ? job.stages.filter((s) => s.type === 'interview').map((s) => ({ value: s.id, label: s.name })) : []), [job])

  // Default the stage to the candidate's current interview stage, else the first interview stage.
  useEffect(() => {
    if (isReschedule || !selected) return
    const current = selected.stage?.type === 'interview' ? selected.stage.id : stageOptions[0]?.value
    setValue('stageId', current ?? '')
  }, [selected, stageOptions, isReschedule, setValue])

  const submit = async (values, allowConflict = false) => {
    const payload = {
      ...values,
      start: combineDateTime(values.date, values.time),
      durationMin: Number(values.durationMin),
      allowConflict,
    }
    const res = isReschedule ? await actions.reschedule.run(interview.id, payload) : await actions.schedule.run(payload)
    if (res.ok) onClose()
    else if (res.error?.code === 'conflict') setConflict({ message: res.error.message, values })
  }

  const pending = actions.schedule.pending || actions.reschedule.pending
  const candidateName = interview ? fullName(candidatesById.get(interview.candidateId)) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isReschedule ? 'Reschedule interview' : 'Schedule interview'}
      description={isReschedule ? `${interview.stageName} · ${candidateName}` : 'Pick the candidate, stage, time and panel.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="schedule-form" loading={pending}>
            {isReschedule ? 'Save new time' : 'Schedule interview'}
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={handleSubmit((v) => submit(v))} noValidate className="space-y-5">
        {!isReschedule && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Candidate & vacancy" required error={errors.applicationId?.message} className="sm:col-span-2">
              {(a) => <Select {...a} {...register('applicationId', rules.required('Candidate'))} options={appOptions} placeholder="Select an active application" invalid={!!errors.applicationId} data-autofocus />}
            </Field>
            <Field label="Interview stage" required error={errors.stageId?.message} hint={job && !stageOptions.length ? 'This vacancy has no interview stages.' : undefined}>
              {(a) => <Select {...a} {...register('stageId', rules.required('Stage'))} options={stageOptions} placeholder={job ? 'Select stage' : 'Select a candidate first'} disabled={!job} invalid={!!errors.stageId} />}
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Date" required error={errors.date?.message}>
            {(a) => <Input {...a} type="date" {...register('date', rules.futureDate)} invalid={!!errors.date} />}
          </Field>
          <Field label="Start time" required error={errors.time?.message}>
            {(a) => <Input {...a} type="time" step={900} {...register('time', rules.required('Time'))} invalid={!!errors.time} />}
          </Field>
          <Field label="Duration" className="col-span-2 sm:col-span-1">
            {(a) => <Select {...a} {...register('durationMin')} options={DURATIONS} />}
          </Field>
        </div>

        <Field label="Interviewers" required error={errors.interviewerIds?.message}>
          {(a) => (
            <Controller
              name="interviewerIds"
              control={control}
              rules={{ validate: (v) => v.length > 0 || 'Select at least one interviewer' }}
              render={({ field }) => <InterviewerPicker id={a.id} value={field.value} onChange={field.onChange} departmentId={job?.departmentId} invalid={!!errors.interviewerIds} />}
            />
          )}
        </Field>

        <div className="space-y-3">
          <p className="text-xs font-medium text-ink-soft">Format</p>
          <Controller name="mode" control={control} render={({ field }) => <SegmentedControl label="Interview format" options={MODES} value={field.value} onChange={field.onChange} />} />
          {mode === 'Video' ? (
            <MockNotice>A meeting link will be generated once a calendar/meeting integration (Google Meet, Teams, Zoom) is connected. No invite is sent in demo mode.</MockNotice>
          ) : (
            <Field label={mode === 'Phone' ? 'Phone details' : 'Location'} required error={errors.location?.message}>
              {(a) => <Input {...a} {...register('location', { validate: (v) => mode === 'Video' || !!v.trim() || 'Location is required' })} placeholder={mode === 'Phone' ? 'Interviewer calls candidate on file number' : 'Office and room'} invalid={!!errors.location} />}
            </Field>
          )}
        </div>

        <Field label="Notes for the panel" optional>
          {(a) => <Textarea {...a} {...register('notes')} rows={2} placeholder="Focus areas, materials to review…" />}
        </Field>

        {conflict && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm sm:flex-row sm:items-center" role="alert">
            <AlertTriangle size={16} className="shrink-0 text-amber-600" aria-hidden />
            <p className="flex-1 text-amber-900">{conflict.message}</p>
            <Button size="sm" variant="secondary" onClick={() => submit(conflict.values, true)} loading={pending}>
              Schedule anyway
            </Button>
          </div>
        )}
      </form>
    </Modal>
  )
}
