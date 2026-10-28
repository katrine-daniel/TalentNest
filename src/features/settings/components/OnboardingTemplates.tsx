import { useState } from 'react'
import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, Input, Select } from '@/components/ui/FormControls'
import { useCollection } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { ROLES } from '@/utils/permissions'
import type { OnboardingTemplate } from '@/types/domain'
import { settingsService } from '../settingsService'

type Draft = Omit<OnboardingTemplate, 'id'> & { id?: string }
const blankTask = (): Draft['tasks'][number] => ({ id: '', label: '', ownerRole: null, dueOffsetDays: 0, requiresDocument: false })

/** Reusable onboarding checklists. Due dates are offsets from the start date (negative = before day one). */
export default function OnboardingTemplates({ readOnly }: { readOnly: boolean }) {
  const templates = useCollection('onboardingTemplates')
  const [editing, setEditing] = useState<Draft | null>(null)
  const [deleting, setDeleting] = useState<OnboardingTemplate | null>(null)
  const save = useAsyncAction((v: Draft) => settingsService.saveOnboardingTemplate(v), { success: 'Onboarding template saved' })
  const remove = useAsyncAction((id: string) => settingsService.deleteOnboardingTemplate(id), { success: 'Template deleted' })

  const setTask = (i: number, patch: Partial<Draft['tasks'][number]>) =>
    setEditing((d) => d && { ...d, tasks: d.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" icon={Plus} disabled={readOnly} onClick={() => setEditing({ name: '', tasks: [blankTask()] })}>
          New template
        </Button>
      </div>
      <ul className="space-y-3">
        {templates.map((t) => (
          <li key={t.id} className="border-line/80 bg-surface shadow-card rounded-2xl border p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                <p className="text-muted text-xs">{t.tasks.length} checklist items</p>
              </div>
              {!readOnly && (
                <>
                  <Button size="sm" variant="ghost" iconOnly icon={Pencil} aria-label={`Edit ${t.name}`} onClick={() => setEditing(structuredClone(t))} />
                  <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)} />
                </>
              )}
            </div>
            <ol className="text-ink-soft mt-2 list-decimal space-y-0.5 pl-5 text-sm">
              {t.tasks.map((task) => (
                <li key={task.id}>
                  {task.label}
                  <span className="text-muted text-xs">
                    {' '}
                    · {task.ownerRole ?? 'Unassigned'} · day {task.dueOffsetDays >= 0 ? `+${task.dueOffsetDays}` : task.dueOffsetDays}
                  </span>
                  {task.requiresDocument && <Paperclip size={12} className="text-muted ml-1 inline" aria-label="Requires a document" />}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?.id ? 'Edit onboarding template' : 'New onboarding template'}
        description="Day offsets are relative to the start date — use negative numbers for pre-boarding."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={save.pending}
              onClick={async () => {
                if (!editing) return
                const res = await save.run(editing)
                if (res.ok) setEditing(null)
              }}
            >
              Save template
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Template name" required>
              {(a) => <Input {...a} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-autofocus />}
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-ink-soft mb-1 text-xs font-medium">Checklist items</legend>
              {editing.tasks.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[2fr_1fr_5rem_auto_auto]">
                  <Input
                    aria-label={`Item ${i + 1}`}
                    value={t.label}
                    onChange={(e) => setTask(i, { label: e.target.value })}
                    placeholder="e.g. Collect signed offer letter"
                    className="max-sm:col-span-2"
                  />
                  <Select
                    aria-label={`Item ${i + 1} owner`}
                    value={t.ownerRole ?? ''}
                    onChange={(e) => setTask(i, { ownerRole: (e.target.value || null) as Draft['tasks'][number]['ownerRole'] })}
                    options={ROLES.map((r) => ({ value: r, label: r }))}
                    placeholder="Owner role"
                  />
                  <Input
                    aria-label={`Item ${i + 1} day offset`}
                    type="number"
                    min={-30}
                    max={90}
                    value={t.dueOffsetDays}
                    onChange={(e) => setTask(i, { dueOffsetDays: Number(e.target.value) })}
                  />
                  <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="accent-brand-600 size-4"
                      checked={t.requiresDocument}
                      onChange={(e) => setTask(i, { requiresDocument: e.target.checked })}
                    />{' '}
                    Document
                  </label>
                  <Button
                    variant="ghost"
                    iconOnly
                    icon={Trash2}
                    aria-label={`Remove item ${i + 1}`}
                    onClick={() => setEditing({ ...editing, tasks: editing.tasks.filter((_, j) => j !== i) })}
                  />
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => setEditing({ ...editing, tasks: [...editing.tasks, blankTask()] })}>
                Add item
              </Button>
            </fieldset>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this onboarding template?"
        description="Plans already started from it are not affected."
        confirmLabel="Delete template"
        tone="danger"
        loading={remove.pending}
        onConfirm={async () => {
          if (!deleting) return
          const res = await remove.run(deleting.id)
          if (res.ok) setDeleting(null)
        }}
      />
    </div>
  )
}
