import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/FormControls'
import { useSchedulingActions } from '@/hooks/useScheduling'

/** Records an evaluator's score for a submitted assessment. */
export default function ScoreAssessmentModal({ row, onClose }) {
  const actions = useSchedulingActions()
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm()
  const passMark = row?.template?.passMark ?? 60

  useEffect(() => {
    if (row) reset({ score: row.assessment.score ?? '', notes: row.assessment.notes ?? '' })
  }, [row, reset])

  const score = Number(watch('score'))

  const onSubmit = async (values) => {
    const res = await actions.recordScore.run(row.id, values)
    if (res.ok) onClose()
  }

  return (
    <Modal
      open={Boolean(row)}
      onClose={onClose}
      size="sm"
      title="Record assessment score"
      description={row ? `${row.candidateName} · ${row.template?.name}` : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="score-form" loading={actions.recordScore.pending}>
            Save score
          </Button>
        </>
      }
    >
      <form id="score-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Score (%)" required error={errors.score?.message} hint={`Pass mark ${passMark}%`}>
          {(a) => (
            <Input
              {...a}
              type="number"
              min={0}
              max={100}
              data-autofocus
              {...register('score', { required: 'Score is required', valueAsNumber: true, min: { value: 0, message: '0–100' }, max: { value: 100, message: '0–100' } })}
              invalid={!!errors.score}
            />
          )}
        </Field>
        {Number.isFinite(score) && watch('score') !== '' && (
          <p className={`text-sm font-medium ${score >= passMark ? 'text-emerald-700' : 'text-red-600'}`} role="status">
            {score >= passMark ? 'Meets the pass mark' : 'Below the pass mark'} — the stage is not changed automatically.
          </p>
        )}
        <Field label="Evaluator notes" optional>
          {(a) => <Textarea {...a} rows={3} {...register('notes')} />}
        </Field>
      </form>
    </Modal>
  )
}
