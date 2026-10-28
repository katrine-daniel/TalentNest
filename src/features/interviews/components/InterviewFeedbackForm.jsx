import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/FormControls'
import { RECOMMENDATIONS } from './FeedbackSummary'
import { useLookups, fullName } from '@/hooks/useStore'
import { useSchedulingActions } from '@/features/interviews/hooks/useScheduling'
import { cn } from '@/utils/cn'

const LABELS = ['Poor', 'Below bar', 'Meets bar', 'Strong', 'Exceptional']

function RatingInput({ value, onChange, name, invalid }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          title={LABELS[n - 1]}
          onClick={() => onChange(n)}
          className={cn(
            'tabular h-9 w-9 rounded-md border text-sm font-medium transition-colors',
            value === n
              ? 'border-brand-600 bg-brand-600 text-white'
              : value && n < value
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-line-strong text-ink-soft hover:border-brand-300',
            invalid && !value && 'border-red-300',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/** Structured evaluation scorecard for one interview. */
export default function InterviewFeedbackForm({ open, onClose, interview }) {
  const { scorecardsById, candidatesById } = useLookups()
  const actions = useSchedulingActions()
  const scorecard = interview ? scorecardsById.get(interview.scorecardId) : null
  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm()

  useEffect(() => {
    if (!open || !scorecard) return
    reset({
      ratings: Object.fromEntries(scorecard.criteria.map((c) => [c.id, interview.feedback?.ratings?.[c.id] ?? 0])),
      recommendation: interview.feedback?.recommendation ?? '',
      strengths: interview.feedback?.strengths ?? '',
      concerns: interview.feedback?.concerns ?? '',
      summary: interview.feedback?.summary ?? '',
    })
  }, [open, scorecard, interview, reset])

  const ratings = watch('ratings') ?? {}
  const weighted = scorecard ? scorecard.criteria.reduce((sum, c) => sum + (ratings[c.id] ?? 0) * c.weight, 0) / 100 : 0

  const onSubmit = async (values) => {
    const res = await actions.submitFeedback.run(interview.id, values)
    if (res.ok) onClose()
  }

  return (
    <Modal
      open={open && Boolean(interview)}
      onClose={onClose}
      size="lg"
      title="Interview feedback"
      description={interview ? `${interview.stageName} · ${fullName(candidatesById.get(interview.candidateId))} · ${scorecard?.name ?? ''} scorecard` : ''}
      footer={
        <>
          <span className="text-muted mr-auto hidden text-xs sm:block">
            Weighted score <strong className="text-ink tabular">{weighted.toFixed(1)}</strong> / 5
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="feedback-form" loading={actions.submitFeedback.pending}>
            Submit feedback
          </Button>
        </>
      }
    >
      {scorecard && (
        <form id="feedback-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
          <fieldset>
            <legend className="text-muted mb-3 text-xs font-semibold tracking-wide uppercase">Scorecard</legend>
            <div className="divide-line border-line divide-y rounded-lg border">
              {scorecard.criteria.map((c) => (
                <div key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xxs text-muted">Weight {c.weight}%</p>
                  </div>
                  <Controller
                    name={`ratings.${c.id}`}
                    control={control}
                    rules={{ validate: (v) => v > 0 || 'Rate this criterion' }}
                    render={({ field }) => <RatingInput name={c.name} value={field.value} onChange={field.onChange} invalid={!!errors.ratings?.[c.id]} />}
                  />
                </div>
              ))}
            </div>
            {errors.ratings && (
              <p className="mt-2 text-xs text-red-600" role="alert">
                Rate every criterion before submitting.
              </p>
            )}
          </fieldset>

          <Field label="Recommendation" required error={errors.recommendation?.message}>
            {() => (
              <Controller
                name="recommendation"
                control={control}
                rules={{ required: 'Choose a recommendation' }}
                render={({ field }) => (
                  <div role="radiogroup" aria-label="Recommendation" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {RECOMMENDATIONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        role="radio"
                        aria-checked={field.value === r.value}
                        onClick={() => field.onChange(r.value)}
                        className={cn(
                          'h-10 rounded-lg border text-sm transition-colors',
                          field.value === r.value
                            ? r.tone === 'green'
                              ? 'border-emerald-500 bg-emerald-50 font-medium text-emerald-800'
                              : 'border-red-400 bg-red-50 font-medium text-red-700'
                            : 'border-line-strong text-ink-soft hover:bg-subtle',
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Strengths" required error={errors.strengths?.message}>
              {(a) => <Textarea {...a} rows={3} {...register('strengths', { required: 'Describe at least one strength' })} invalid={!!errors.strengths} />}
            </Field>
            <Field label="Concerns" optional>
              {(a) => <Textarea {...a} rows={3} {...register('concerns')} />}
            </Field>
          </div>
          <Field label="Summary for the hiring team" optional>
            {(a) => <Textarea {...a} rows={2} {...register('summary')} />}
          </Field>
          <p className="text-muted text-xs">Feedback informs the panel’s decision; it does not move the candidate automatically.</p>
        </form>
      )}
    </Modal>
  )
}
