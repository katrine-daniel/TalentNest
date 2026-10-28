import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, Input, Textarea } from '@/components/ui/FormControls'
import WorkflowBuilder from '@/features/jobs/components/WorkflowBuilder'
import { useCollection } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { settingsService } from '@/features/settings/settingsService'
import { cn } from '@/utils/cn'

const toEditable = (t) => ({ ...t, stages: t.stages.map((s) => ({ ...s, id: s.key })) })

const NEW_TEMPLATE = {
  name: 'New workflow',
  description: '',
  stages: [
    { key: 'new', id: 'new', name: 'New Application', type: 'application' },
    { key: 'screen', id: 'screen', name: 'Screening', type: 'screening' },
    { key: 'int', id: 'int', name: 'Interview', type: 'interview' },
    { key: 'offer', id: 'offer', name: 'Offer', type: 'offer' },
    { key: 'hired', id: 'hired', name: 'Hired', type: 'hired' },
  ],
}

/** Reusable workflow templates; vacancies copy a template's stages when created. */
export default function WorkflowSettings({ readOnly }) {
  const templates = useCollection('workflowTemplates')
  const jobs = useCollection('jobs')
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? null)
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const save = useAsyncAction(settingsService.saveWorkflowTemplate, { success: 'Workflow template saved' })
  const remove = useAsyncAction(settingsService.deleteWorkflowTemplate, { success: 'Template deleted' })

  const selected = templates.find((t) => t.id === selectedId)
  useEffect(() => {
    if (selected) setDraft(toEditable(selected))
    setError(null)
  }, [selected])

  const usage = selectedId ? jobs.filter((j) => j.workflowTemplateId === selectedId).length : 0
  const dirty = draft && selected ? JSON.stringify(toEditable(selected)) !== JSON.stringify(draft) : Boolean(draft && !draft.id)

  const onSave = async () => {
    const res = await save.run({ ...draft, stages: draft.stages.map((s) => ({ key: s.key ?? s.id, name: s.name, type: s.type })) })
    if (res.ok) setSelectedId(res.data.id)
    else setError(res.error?.message)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="space-y-2">
        <ul className="space-y-1">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={cn('w-full rounded-lg border px-3 py-2.5 text-left transition-colors', t.id === selectedId ? 'border-brand-200 bg-brand-50' : 'border-transparent hover:bg-subtle')}
              >
                <span className="block text-sm font-medium">{t.name}</span>
                <span className="block text-xs text-muted">
                  {t.stages.length} stages · {jobs.filter((j) => j.workflowTemplateId === t.id).length} vacancies
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          icon={Plus}
          className="w-full"
          disabled={readOnly}
          onClick={() => {
            setSelectedId(null)
            setDraft({ ...NEW_TEMPLATE, stages: NEW_TEMPLATE.stages.map((s) => ({ ...s })) })
          }}
        >
          New template
        </Button>
      </div>

      {draft ? (
        <div className="space-y-5 rounded-2xl border border-line/80 bg-surface shadow-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Template name" required>
              {(a) => <Input {...a} value={draft.name} disabled={readOnly} onChange={(e) => setDraft({ ...draft, name: e.target.value })} invalid={!draft.name.trim()} />}
            </Field>
            <Field label="Description" optional>
              {(a) => <Textarea {...a} rows={1} value={draft.description} disabled={readOnly} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />}
            </Field>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-ink-soft">Stages</p>
            {readOnly ? (
              <WorkflowBuilder readOnly stages={draft.stages} />
            ) : (
              <WorkflowBuilder
                stages={draft.stages}
                error={error}
                onChange={(stages) => {
                  setDraft({ ...draft, stages: stages.map((s) => ({ ...s, key: s.key ?? s.id })) })
                  setError(null)
                }}
              />
            )}
          </div>
          {usage > 0 && <p className="text-xs text-muted">Changes apply to new vacancies. The {usage} existing vacancies using this template keep their own stages.</p>}
          <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
            {draft.id ? (
              <Button variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(true)} disabled={readOnly || usage > 0} title={usage > 0 ? 'Templates in use cannot be deleted' : undefined}>
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" disabled={!dirty} onClick={() => (selected ? setDraft(toEditable(selected)) : setSelectedId(templates[0]?.id))}>
                Discard
              </Button>
              <Button variant="primary" onClick={onSave} loading={save.pending} disabled={readOnly || !dirty}>
                Save template
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete “${draft?.name}”?`}
        description="This template will no longer be available for new vacancies."
        confirmLabel="Delete template"
        tone="danger"
        loading={remove.pending}
        onConfirm={async () => {
          const res = await remove.run(draft.id)
          if (res.ok) {
            setDeleting(false)
            setSelectedId(templates.find((t) => t.id !== draft.id)?.id ?? null)
          }
        }}
      />
    </div>
  )
}
