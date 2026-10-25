import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Pencil, Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import DataTable from '@/components/ui/DataTable'
import { Field, Input, Select } from '@/components/ui/FormControls'
import { useCollection } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { settingsService } from '@/services/settingsService'
import { ASSESSMENT_TYPES } from '@/data/mockSettings'
import { rules } from '@/utils/validation'

export default function AssessmentTemplates({ readOnly }) {
  const templates = useCollection('assessmentTemplates')
  const assessments = useCollection('assessments')
  const [editing, setEditing] = useState(null)
  const save = useAsyncAction(settingsService.saveAssessmentTemplate, { success: 'Assessment template saved' })
  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  useEffect(() => {
    if (editing) reset({ name: '', type: 'Domain knowledge', durationMin: 45, passMark: 60, questionCount: 20, provider: 'Internal (mock)', workflowTemplateIds: [], ...editing })
  }, [editing, reset])

  const onSubmit = async (values) => {
    const res = await save.run({ ...editing, ...values })
    if (res.ok) setEditing(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" icon={Plus} onClick={() => setEditing({})} disabled={readOnly}>
          New template
        </Button>
      </div>
      <div className="rounded-xl border border-line bg-surface">
        <DataTable
          rows={templates}
          columns={[
            { key: 'name', header: 'Assessment', render: (t) => <span className="font-medium">{t.name}</span> },
            { key: 'type', header: 'Type', hideBelow: 'md', render: (t) => <span className="text-ink-soft">{t.type}</span> },
            { key: 'durationMin', header: 'Duration', align: 'right', hideBelow: 'lg', render: (t) => `${t.durationMin} min` },
            { key: 'questionCount', header: 'Questions', align: 'right', hideBelow: 'lg' },
            { key: 'passMark', header: 'Pass mark', align: 'right', render: (t) => `${t.passMark}%` },
            { key: 'uses', header: 'Assigned', align: 'right', hideBelow: 'md', render: (t) => assessments.filter((a) => a.templateId === t.id).length },
            {
              key: 'edit',
              header: <span className="sr-only">Edit</span>,
              align: 'right',
              render: (t) => <Button size="sm" variant="ghost" iconOnly icon={Pencil} aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)} disabled={readOnly} />,
            },
          ]}
          mobileCard={(t) => (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted">
                  {t.type} · {t.durationMin} min · pass {t.passMark}%
                </p>
              </div>
              <Button size="sm" variant="ghost" iconOnly icon={Pencil} aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)} disabled={readOnly} />
            </div>
          )}
        />
      </div>
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit assessment template' : 'New assessment template'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="at-form" loading={save.pending}>
              Save
            </Button>
          </>
        }
      >
        <form id="at-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Field label="Name" required error={errors.name?.message}>
            {(a) => <Input {...a} {...register('name', rules.required('Name'))} invalid={!!errors.name} data-autofocus />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">{(a) => <Select {...a} {...register('type')} options={ASSESSMENT_TYPES.map((t) => ({ value: t, label: t }))} />}</Field>
            <Field label="Provider" hint="Integration placeholder">
              {(a) => <Input {...a} {...register('provider')} />}
            </Field>
            <Field label="Duration (minutes)" required error={errors.durationMin?.message}>
              {(a) => <Input {...a} type="number" {...register('durationMin', rules.positiveInt('Duration', { min: 5, max: 240 }))} invalid={!!errors.durationMin} />}
            </Field>
            <Field label="Questions" required error={errors.questionCount?.message}>
              {(a) => <Input {...a} type="number" {...register('questionCount', rules.positiveInt('Questions', { min: 1, max: 200 }))} invalid={!!errors.questionCount} />}
            </Field>
            <Field label="Pass mark (%)" required error={errors.passMark?.message}>
              {(a) => <Input {...a} type="number" {...register('passMark', rules.positiveInt('Pass mark', { min: 1, max: 100 }))} invalid={!!errors.passMark} />}
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  )
}
