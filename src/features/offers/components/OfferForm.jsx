import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import MockNotice from '@/components/ui/MockNotice'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import { useApplicationOptions, useOfferActions } from '@/features/interviews/hooks/useScheduling'
import { useLookups, fullName } from '@/hooks/useStore'
import { combineDateTime, toInputDate, addDays } from '@/utils/formatDate'
import { rules } from '@/utils/validation'

const OFFER_STAGES = ['interview', 'decision', 'offer']

const formatINR = (n) => (n ? `₹${Number(n).toLocaleString('en-IN')}` : '—')

/** Create a new offer or revise an existing one (`offer` prop). */
export default function OfferForm({ open, onClose, offer, prefill }) {
  const isEdit = Boolean(offer)
  const appOptions = useApplicationOptions({ stageTypes: OFFER_STAGES })
  const { candidatesById, jobsById } = useLookups()
  const actions = useOfferActions()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm({
    defaultValues: { applicationId: '', salary: '', joiningBonus: 0, startDate: '', expiresAt: '', notes: '', send: true },
  })

  useEffect(() => {
    if (!open) return
    if (offer) {
      reset({
        applicationId: offer.applicationId,
        salary: offer.salary,
        joiningBonus: offer.joiningBonus,
        startDate: toInputDate(offer.startDate),
        expiresAt: toInputDate(offer.expiresAt),
        notes: offer.notes ?? '',
        send: false,
      })
    } else {
      reset({
        applicationId: prefill?.applicationId ?? '',
        salary: '',
        joiningBonus: 0,
        startDate: toInputDate(addDays(new Date(), 21)),
        expiresAt: toInputDate(addDays(new Date(), 7)),
        notes: '',
        send: true,
      })
    }
  }, [open, offer, prefill, reset])

  const applicationId = watch('applicationId')
  const selected = appOptions.find((o) => o.value === applicationId)

  useEffect(() => {
    if (isEdit || !selected) return
    const { candidate, job } = selected
    const suggested = Math.min(job.salaryMax || Infinity, candidate.expectedSalary || job.salaryMin || 0)
    if (!getValues('salary')) setValue('salary', suggested || '')
  }, [selected, isEdit, setValue, getValues])

  const job = selected?.job ?? (offer ? jobsById.get(offer.jobId) : null)

  const onSubmit = async (values) => {
    const payload = { ...values, startDate: combineDateTime(values.startDate, '09:30'), expiresAt: combineDateTime(values.expiresAt, '23:59') }
    const res = isEdit
      ? await actions.update.run(offer.id, {
          salary: payload.salary,
          joiningBonus: Number(payload.joiningBonus) || 0,
          startDate: payload.startDate,
          expiresAt: payload.expiresAt,
          notes: payload.notes,
        })
      : await actions.create.run(payload)
    if (res.ok) onClose()
  }

  const pending = actions.create.pending || actions.update.pending

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Revise offer' : 'Create offer'}
      description={
        isEdit
          ? `${fullName(candidatesById.get(offer.candidateId))} · ${jobsById.get(offer.jobId)?.title}`
          : 'Offers can be prepared for candidates in interview, decision or offer stages.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="offer-form" loading={pending}>
            {isEdit ? 'Save revision' : 'Create offer'}
          </Button>
        </>
      }
    >
      <form id="offer-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {!isEdit && (
          <Field
            label="Candidate & vacancy"
            required
            error={errors.applicationId?.message}
            hint={!appOptions.length ? 'No candidates are currently in an interview, decision or offer stage.' : undefined}
          >
            {(a) => (
              <Select
                {...a}
                {...register('applicationId', rules.required('Candidate'))}
                options={appOptions}
                placeholder="Select application"
                invalid={!!errors.applicationId}
                data-autofocus
              />
            )}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Annual CTC (₹)"
            required
            error={errors.salary?.message}
            hint={job ? `Band ${formatINR(job.salaryMin)} – ${formatINR(job.salaryMax)}` : undefined}
          >
            {(a) => (
              <Input
                {...a}
                type="number"
                min={0}
                step={10000}
                {...register('salary', { required: 'Salary is required', min: { value: 100000, message: 'Enter an annual amount' } })}
                invalid={!!errors.salary}
              />
            )}
          </Field>
          <Field label="Joining bonus (₹)" optional>
            {(a) => <Input {...a} type="number" min={0} step={5000} {...register('joiningBonus')} />}
          </Field>
          <Field label="Proposed start date" required error={errors.startDate?.message}>
            {(a) => <Input {...a} type="date" {...register('startDate', rules.futureDate)} invalid={!!errors.startDate} />}
          </Field>
          <Field label="Offer valid until" required error={errors.expiresAt?.message}>
            {(a) => <Input {...a} type="date" {...register('expiresAt', rules.futureDate)} invalid={!!errors.expiresAt} />}
          </Field>
        </div>
        {job && Number(watch('salary')) > job.salaryMax && job.salaryMax > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
            This offer is above the approved salary band and may need additional approval.
          </p>
        )}
        <Field label="Internal notes" optional>
          {(a) => <Textarea {...a} {...register('notes')} rows={2} />}
        </Field>
        {!isEdit && <Checkbox label="Mark as sent to candidate" description="Uncheck to save as a draft for approval first." {...register('send')} />}
        <MockNotice>Offer letters are not generated or emailed in demo mode. Status changes are recorded for tracking only.</MockNotice>
      </form>
    </Modal>
  )
}
