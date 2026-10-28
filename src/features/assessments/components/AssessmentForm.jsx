import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Clock, Gauge, ListChecks } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import MockNotice from '@/components/ui/MockNotice'
import { Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import { useApplicationOptions, useSchedulingActions } from '@/features/interviews/hooks/useScheduling'
import { useCollection } from '@/hooks/useStore'
import { rules } from '@/utils/validation'
import { combineDateTime, toInputDate, addDays } from '@/utils/formatDate'
import { ASSESSMENT_FOR_WORKFLOW } from '@/data/mockSettings'

/** Assign an assessment to a candidate application with a deadline. */
export default function AssessmentForm({ open, onClose, prefill }) {
  const appOptions = useApplicationOptions()
  const templates = useCollection('assessmentTemplates')
  const actions = useSchedulingActions()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: { applicationId: '', templateId: '', date: '', time: '18:00', notes: '' },
  })

  useEffect(() => {
    if (!open) return
    reset({ applicationId: prefill?.applicationId ?? '', templateId: '', date: prefill?.date ?? toInputDate(addDays(new Date(), 3)), time: '18:00', notes: '' })
  }, [open, prefill, reset])

  const applicationId = watch('applicationId')
  const templateId = watch('templateId')
  const selected = appOptions.find((o) => o.value === applicationId)
  const template = templates.find((t) => t.id === templateId)

  // Suggest the template that matches the vacancy's workflow.
  useEffect(() => {
    if (!selected) return
    const suggested = ASSESSMENT_FOR_WORKFLOW[selected.job.workflowTemplateId]
    if (suggested) setValue('templateId', suggested)
  }, [selected, setValue])

  const templateOptions = useMemo(() => templates.map((t) => ({ value: t.id, label: `${t.name} · ${t.type}` })), [templates])

  const onSubmit = async (values) => {
    const res = await actions.assign.run({
      applicationId: values.applicationId,
      templateId: values.templateId,
      deadline: combineDateTime(values.date, values.time),
      notes: values.notes,
    })
    if (res.ok) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign assessment"
      description="Candidates receive the assessment link from the assessment provider once integrated."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={actions.assign.pending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="assessment-form" loading={actions.assign.pending}>
            Assign assessment
          </Button>
        </>
      }
    >
      <form id="assessment-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Candidate & vacancy" required error={errors.applicationId?.message}>
          {(a) => (
            <Select
              {...a}
              {...register('applicationId', rules.required('Candidate'))}
              options={appOptions}
              placeholder="Select an active application"
              invalid={!!errors.applicationId}
              data-autofocus
            />
          )}
        </Field>
        <Field label="Assessment" required error={errors.templateId?.message}>
          {(a) => (
            <Select
              {...a}
              {...register('templateId', rules.required('Assessment'))}
              options={templateOptions}
              placeholder="Select assessment template"
              invalid={!!errors.templateId}
            />
          )}
        </Field>
        {template && (
          <dl className="divide-line border-line grid grid-cols-3 divide-x rounded-lg border text-center">
            {[
              { icon: Clock, label: 'Duration', value: `${template.durationMin} min` },
              { icon: Gauge, label: 'Pass mark', value: `${template.passMark}%` },
              { icon: ListChecks, label: 'Questions', value: template.questionCount },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="px-2 py-2.5">
                <dt className="text-xxs text-muted flex items-center justify-center gap-1">
                  <Icon size={12} aria-hidden /> {label}
                </dt>
                <dd className="tabular mt-0.5 text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Deadline date" required error={errors.date?.message}>
            {(a) => <Input {...a} type="date" {...register('date', rules.futureDate)} invalid={!!errors.date} />}
          </Field>
          <Field label="Deadline time" required>
            {(a) => <Input {...a} type="time" {...register('time', rules.required('Time'))} />}
          </Field>
        </div>
        <Field label="Instructions for the candidate" optional>
          {(a) => <Textarea {...a} {...register('notes')} rows={2} />}
        </Field>
        <MockNotice>Demo mode records the assignment only — no invitation email or test link is sent.</MockNotice>
      </form>
    </Modal>
  )
}
