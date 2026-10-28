import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useCollection, useDbData } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import type { AutomationAction, AutomationCondition, AutomationRule, AutomationTrigger } from '@/types/domain'
import type { DomainEvent } from '@/services/events/eventBus'
import { CONDITION_FIELDS, OPERATORS, TRIGGERS, validateRule } from '../automationEngine'
import { previewRule } from '../automationService'
import { automationRuleService, type RuleInput } from '../automationRuleService'

const BLANK: RuleInput = { name: '', description: '', trigger: 'stage.changed', conditions: [], actions: [], enabled: true }

const ACTION_DEFAULTS: Record<AutomationAction['type'], AutomationAction> = {
  create_task: { type: 'create_task', title: 'Follow up with {candidate}', assignTo: 'recruiter', dueInDays: 2 },
  notify: { type: 'notify', userId: 'hiring_manager', message: '{candidate} moved to {stage} for {job}' },
  assign_recruiter: { type: 'assign_recruiter', userId: '' },
  create_onboarding_plan: { type: 'create_onboarding_plan', templateId: '' },
}
const ACTION_LABELS: Record<AutomationAction['type'], string> = {
  create_task: 'Create a task',
  notify: 'Send in-app notification',
  assign_recruiter: 'Assign recruiter',
  create_onboarding_plan: 'Start onboarding checklist',
}

/** Builds a realistic event for the chosen sample application so the rule can be dry-run. */
function sampleEvent(trigger: AutomationTrigger, applicationId: string, data: ReturnType<typeof useDbData>): DomainEvent | null {
  const app = data.applications.find((a) => a.id === applicationId)
  if (!app) return null
  const base = { applicationId: app.id, candidateId: app.candidateId, jobId: app.jobId, stageId: app.stageId }
  const interview = [...data.interviews].reverse().find((i) => i.applicationId === app.id)
  const offer = data.offers.find((o) => o.applicationId === app.id)
  switch (trigger) {
    case 'interview.completed':
    case 'feedback.overdue':
      return {
        type: trigger,
        entityId: interview?.id ?? app.id,
        actorId: null,
        context: { ...base, interviewId: interview?.id, hoursOverdue: trigger === 'feedback.overdue' ? 48 : undefined },
      }
    case 'offer.accepted':
      return { type: trigger, entityId: offer?.id ?? app.id, actorId: null, context: { ...base, offerId: offer?.id } }
    default:
      return { type: trigger, entityId: app.id, actorId: null, context: base }
  }
}

export default function RuleEditor({ open, onClose, rule }: { open: boolean; onClose: () => void; rule: AutomationRule | null }) {
  const { actorId } = useSession()
  const data = useDbData()
  const users = useCollection('users')
  const templates = useCollection('onboardingTemplates')
  const [draft, setDraft] = useState<RuleInput>(BLANK)
  const [sampleId, setSampleId] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const save = useAsyncAction((v: RuleInput) => (rule ? automationRuleService.update(rule.id, v, { actorId }) : automationRuleService.create(v, { actorId })), {
    success: rule ? 'Rule updated' : 'Rule created',
  })

  useEffect(() => {
    if (!open) return
    setDraft(
      rule
        ? { name: rule.name, description: rule.description, trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions, enabled: rule.enabled }
        : BLANK,
    )
    setShowErrors(false)
    setSampleId(data.applications[0]?.id ?? '')
    // Only reset when the dialog opens or the edited rule changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule])

  const validation = validateRule(draft, data)
  const preview = useMemo(() => {
    const event = sampleEvent(draft.trigger, sampleId, data)
    if (!event) return null
    const asRule: AutomationRule = { ...draft, id: 'preview', createdById: actorId, createdAt: '', updatedAt: '' }
    return previewRule(asRule, event, data)
  }, [draft, sampleId, data, actorId])

  const set = (patch: Partial<RuleInput>) => setDraft((d) => ({ ...d, ...patch }))
  const setCondition = (i: number, patch: Partial<AutomationCondition>) =>
    set({ conditions: draft.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const setAction = (i: number, next: AutomationAction) => set({ actions: draft.actions.map((a, j) => (j === i ? next : a)) })
  const fields = CONDITION_FIELDS.filter((f) => !f.triggers || f.triggers.includes(draft.trigger))
  const userTargets = [
    { value: 'recruiter', label: 'Vacancy recruiter' },
    { value: 'hiring_manager', label: 'Hiring manager' },
    ...users.filter((u) => u.status === 'active').map((u) => ({ value: u.id, label: u.name })),
  ]
  const candidateLabel = (id: string) => {
    const c = data.candidates.find((x) => x.id === id)
    return c ? `${c.firstName} ${c.lastName}` : id
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={rule ? 'Edit automation rule' : 'New automation rule'}
      description="When [trigger] happens and all conditions match, run the actions once per record."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={save.pending}
            onClick={async () => {
              setShowErrors(true)
              if (!validation.valid) return
              const res = await save.run(draft)
              if (res.ok) onClose()
            }}
          >
            {rule ? 'Save rule' : 'Create rule'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Field label="Rule name" required>
            {(a) => (
              <Input
                {...a}
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Notify hiring manager at final interview"
                data-autofocus
              />
            )}
          </Field>
          <Field label="Description" optional>
            {(a) => <Textarea {...a} rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />}
          </Field>
          <Field label="When" hint={TRIGGERS.find((t) => t.value === draft.trigger)?.description}>
            {(a) => (
              <Select
                {...a}
                value={draft.trigger}
                onChange={(e) => set({ trigger: e.target.value as AutomationTrigger })}
                options={TRIGGERS.map((t) => ({ value: t.value, label: t.label }))}
              />
            )}
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-ink-soft text-xs font-medium">Only if all conditions match</legend>
            {draft.conditions.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                <Select
                  aria-label={`Condition ${i + 1} field`}
                  value={c.field}
                  onChange={(e) => setCondition(i, { field: e.target.value })}
                  options={fields.map((f) => ({ value: f.value, label: f.label }))}
                  className="max-sm:col-span-2"
                />
                <Select
                  aria-label={`Condition ${i + 1} operator`}
                  value={c.operator}
                  onChange={(e) => setCondition(i, { operator: e.target.value as AutomationCondition['operator'] })}
                  options={OPERATORS.map((o) => ({ value: o.value, label: o.label }))}
                />
                <Input
                  aria-label={`Condition ${i + 1} value`}
                  value={c.value}
                  onChange={(e) => setCondition(i, { value: e.target.value })}
                  placeholder="Value"
                />
                <Button
                  variant="ghost"
                  iconOnly
                  icon={Trash2}
                  aria-label={`Remove condition ${i + 1}`}
                  onClick={() => set({ conditions: draft.conditions.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              icon={Plus}
              onClick={() => set({ conditions: [...draft.conditions, { field: fields[0]?.value ?? 'job.title', operator: 'equals', value: '' }] })}
            >
              Add condition
            </Button>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-ink-soft text-xs font-medium">Then</legend>
            {draft.actions.map((a, i) => (
              <div key={i} className="border-line space-y-2 rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <Select
                    aria-label={`Action ${i + 1} type`}
                    value={a.type}
                    onChange={(e) => setAction(i, ACTION_DEFAULTS[e.target.value as AutomationAction['type']])}
                    options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                  <Button
                    variant="ghost"
                    iconOnly
                    icon={Trash2}
                    aria-label={`Remove action ${i + 1}`}
                    onClick={() => set({ actions: draft.actions.filter((_, j) => j !== i) })}
                    className="ml-auto"
                  />
                </div>
                {a.type === 'create_task' && (
                  <div className="grid gap-2 sm:grid-cols-[2fr_1.2fr_0.8fr]">
                    <Input aria-label="Task title" value={a.title} onChange={(e) => setAction(i, { ...a, title: e.target.value })} />
                    <Select
                      aria-label="Assign task to"
                      value={a.assignTo}
                      onChange={(e) => setAction(i, { ...a, assignTo: e.target.value })}
                      options={userTargets}
                    />
                    <Input
                      aria-label="Due in days"
                      type="number"
                      min={0}
                      max={60}
                      value={a.dueInDays}
                      onChange={(e) => setAction(i, { ...a, dueInDays: Number(e.target.value) })}
                    />
                  </div>
                )}
                {a.type === 'notify' && (
                  <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                    <Select aria-label="Notify" value={a.userId} onChange={(e) => setAction(i, { ...a, userId: e.target.value })} options={userTargets} />
                    <Input aria-label="Message" value={a.message} onChange={(e) => setAction(i, { ...a, message: e.target.value })} />
                  </div>
                )}
                {a.type === 'assign_recruiter' && (
                  <Select
                    aria-label="Recruiter"
                    value={a.userId}
                    onChange={(e) => setAction(i, { ...a, userId: e.target.value })}
                    options={users
                      .filter((u) => u.status === 'active' && (u.role === 'Recruiter' || u.role === 'Admin'))
                      .map((u) => ({ value: u.id, label: u.name }))}
                    placeholder="Choose recruiter"
                  />
                )}
                {a.type === 'create_onboarding_plan' && (
                  <Select
                    aria-label="Onboarding template"
                    value={a.templateId}
                    onChange={(e) => setAction(i, { ...a, templateId: e.target.value })}
                    options={templates.map((t) => ({ value: t.id, label: t.name }))}
                    placeholder="Choose template"
                  />
                )}
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ actions: [...draft.actions, ACTION_DEFAULTS.create_task] })}>
              Add action
            </Button>
            <p className="text-muted text-xs">
              Placeholders: {'{candidate}'}, {'{job}'}, {'{stage}'}.
            </p>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand-600 size-4" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Enabled
          </label>

          {showErrors && !validation.valid && (
            <ul role="alert" className="space-y-1 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <aside className="bg-subtle space-y-3 rounded-xl p-4 lg:col-span-2" aria-label="Dry-run preview">
          <h3 className="text-ink text-sm font-semibold">Preview (dry run)</h3>
          <p className="text-muted text-xs">Tests the rule against a real record. Nothing is changed.</p>
          <Field label="Sample application">
            {(a) => (
              <Select
                {...a}
                value={sampleId}
                onChange={(e) => setSampleId(e.target.value)}
                options={data.applications
                  .slice(0, 200)
                  .map((ap) => ({ value: ap.id, label: `${candidateLabel(ap.candidateId)} · ${data.jobs.find((j) => j.id === ap.jobId)?.title ?? ''}` }))}
              />
            )}
          </Field>
          {preview && (
            <div className="space-y-2 text-sm" aria-live="polite">
              {!preview.validation.valid ? (
                <p className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden /> Fix the rule's validation errors first.
                </p>
              ) : preview.matches ? (
                <>
                  <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 size={15} aria-hidden /> Would run
                  </p>
                  <ul className="text-ink-soft list-disc space-y-1 pl-5 text-xs">
                    {preview.actions.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="text-ink-soft flex items-center gap-2 font-medium">
                    <XCircle size={15} aria-hidden /> Would not run
                  </p>
                  <ul className="text-muted list-disc space-y-1 pl-5 text-xs">
                    {preview.failingConditions.map((c, i) => (
                      <li key={i}>
                        {CONDITION_FIELDS.find((f) => f.value === c.field)?.label} {OPERATORS.find((o) => o.value === c.operator)?.label} “{c.value}” — actual:{' '}
                        {String(preview.context[c.field] ?? 'n/a')}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </Modal>
  )
}
