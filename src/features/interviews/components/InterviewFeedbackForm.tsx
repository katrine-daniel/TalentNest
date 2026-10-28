import { useEffect, useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import MockNotice from '@/components/ui/MockNotice'
import { Field, Textarea } from '@/components/ui/FormControls'
import { RECOMMENDATIONS } from './FeedbackSummary'
import { useLookups, fullName } from '@/hooks/useStore'
import { useSchedulingActions } from '@/features/interviews/hooks/useScheduling'
import { cn } from '@/utils/cn'
import type { Interview, InterviewFeedback, Recommendation } from '@/types/domain'

const LABELS = ['Poor', 'Below the bar', 'Meets the bar', 'Strong', 'Exceptional']

interface FormValues {
  ratings: Record<string, number>
  evidence: Record<string, string>
  recommendation: Recommendation | ''
  strengths: string
  concerns: string
  summary: string
}

function RatingInput({ value, onChange, name, invalid }: { value: number; onChange: (v: number) => void; name: string; invalid: boolean }) {
  return (
    <div role="radiogroup" aria-label={`${name} rating`} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} — ${LABELS[n - 1]}`}
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

/**
 * The signed-in interviewer's scorecard for one interview. Drafts are private;
 * submitting is final and requires a rating for every criterion, a recommendation,
 * and evidence for any extreme (1 or 5) rating.
 */
export default function InterviewFeedbackForm({
  open,
  onClose,
  interview,
  existing,
}: {
  open: boolean
  onClose: () => void
  interview: Interview | null | undefined
  existing?: InterviewFeedback
}) {
  const { scorecardsById, candidatesById } = useLookups()
  const actions = useSchedulingActions()
  const scorecard = interview ? scorecardsById.get(interview.scorecardId) : undefined
  const formId = useId()
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const { control, register, handleSubmit, reset, watch, getValues, formState } = useForm<FormValues>()
  const { errors } = formState

  useEffect(() => {
    if (!open || !scorecard) return
    setSubmitAttempted(false)
    reset({
      ratings: Object.fromEntries(scorecard.criteria.map((c) => [c.id, existing?.ratings?.[c.id] ?? 0])),
      evidence: Object.fromEntries(scorecard.criteria.map((c) => [c.id, existing?.evidence?.[c.id] ?? ''])),
      recommendation: existing?.recommendation ?? '',
      strengths: existing?.strengths ?? '',
      concerns: existing?.concerns ?? '',
      summary: existing?.summary ?? '',
    })
  }, [open, scorecard, existing, reset])

  const ratings = watch('ratings') ?? {}
  const totalWeight = scorecard?.criteria.reduce((s, c) => s + c.weight, 0) || 1
  const weighted = scorecard ? scorecard.criteria.reduce((sum, c) => sum + (ratings[c.id] ?? 0) * c.weight, 0) / totalWeight : 0

  const save = async (submit: boolean) => {
    if (!interview) return
    const values = getValues()
    const res = await actions.saveFeedback.run(interview.id, { ...values, recommendation: values.recommendation || null }, submit)
    if (res.ok) onClose()
  }

  const missingEvidence = (criterionId: string) => {
    const r = ratings[criterionId]
    return submitAttempted && (r === 1 || r === 5) && !getValues(`evidence.${criterionId}`)?.trim()
  }

  return (
    <Modal
      open={open && Boolean(interview)}
      onClose={onClose}
      size="lg"
      title="Your interview scorecard"
      description={interview ? `${interview.stageName} · ${fullName(candidatesById.get(interview.candidateId))} · ${scorecard?.name ?? ''}` : ''}
      footer={
        <>
          <span className="text-muted mr-auto hidden text-xs sm:block">
            Weighted score <strong className="text-ink tabular">{weighted.toFixed(1)}</strong> / 5
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save(false)} loading={actions.saveFeedback.pending}>
            Save draft
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={actions.saveFeedback.pending}>
            Submit
          </Button>
        </>
      }
    >
      {scorecard && (
        <form
          id={formId}
          noValidate
          className="space-y-6"
          onSubmit={(e) => {
            setSubmitAttempted(true)
            void handleSubmit(() => {
              const needsEvidence = scorecard.criteria.some((c) => (ratings[c.id] === 1 || ratings[c.id] === 5) && !getValues(`evidence.${c.id}`)?.trim())
              if (!needsEvidence) void save(true)
            })(e)
          }}
        >
          <fieldset>
            <legend className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">Job-related criteria</legend>
            <p className="text-muted mb-3 text-xs">Rate only what you observed in this interview, and note the evidence behind each rating.</p>
            <div className="divide-line border-line divide-y rounded-lg border">
              {scorecard.criteria.map((c) => (
                <div key={c.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xxs text-muted">Weight {c.weight}%</p>
                    </div>
                    <Controller
                      name={`ratings.${c.id}`}
                      control={control}
                      rules={{ validate: (v) => v > 0 || 'Rate this criterion' }}
                      render={({ field }) => (
                        <RatingInput name={c.name} value={field.value} onChange={field.onChange} invalid={Boolean(errors.ratings?.[c.id])} />
                      )}
                    />
                  </div>
                  <label className="sr-only" htmlFor={`${formId}-ev-${c.id}`}>
                    Evidence for {c.name}
                  </label>
                  <Textarea
                    id={`${formId}-ev-${c.id}`}
                    rows={1}
                    placeholder="Evidence — what did the candidate say or do?"
                    invalid={missingEvidence(c.id)}
                    {...register(`evidence.${c.id}`)}
                  />
                  {missingEvidence(c.id) && (
                    <p className="text-xs text-red-600" role="alert">
                      Ratings of 1 or 5 need supporting evidence.
                    </p>
                  )}
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
              {(a) => (
                <Textarea {...a} rows={3} {...register('strengths', { required: 'Describe at least one strength' })} invalid={Boolean(errors.strengths)} />
              )}
            </Field>
            <Field label="Concerns" optional>
              {(a) => <Textarea {...a} rows={3} {...register('concerns')} />}
            </Field>
          </div>
          <Field label="Summary for the hiring team" optional>
            {(a) => <Textarea {...a} rows={2} {...register('summary')} />}
          </Field>
          <MockNotice>
            Your feedback informs the panel; it does not move the candidate automatically. Other interviewers can see your scorecard only after you submit it.
          </MockNotice>
        </form>
      )}
    </Modal>
  )
}
