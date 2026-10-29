import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { ACTION_LABELS, CONDITION_FIELDS, OPERATORS, PLACEHOLDERS, TRIGGERS, validateRule } from '@/domain/automation'
import type { AssigneeTarget, Priority, RuleAction, RuleCondition, TriggerType, WorkflowRule } from '@/domain/types'
import { fullName } from '@/lib/utils'
import { previewRule, saveRule, type RuleInput } from '@/services/automation'
import type { DomainEvent } from '@/services/events'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Drawer } from '@/components/ui/Overlay'

const BLANK: RuleInput = { name: '', description: '', trigger: 'request.submitted', conditions: [], actions: [], enabled: true, maxAttempts: 3 }
const DEFAULTS: Record<RuleAction['type'], RuleAction> = {
  create_task: { type: 'create_task', title: 'Follow up: {employee}', assignTo: 'hr_queue', dueInDays: 2, priority: 'normal' },
  notify: { type: 'notify', to: 'manager', title: 'Update about {employee}', message: '' },
  send_email: { type: 'send_email', to: 'employee', subject: '', body: '' },
  request_approval: { type: 'request_approval', requestTypeId: '', subject: 'Approval needed for {employee}' },
  update_employee: { type: 'update_employee', field: 'status', value: 'active' },
  start_lifecycle: { type: 'start_lifecycle', kind: 'onboarding', templateId: null },
}

export function RuleEditor({ open, onClose, rule }: { open: boolean; onClose: () => void; rule: WorkflowRule | null }) {
  const db = useDb()
  const { account } = useSession()
  const [draft, setDraft] = useState<RuleInput>(BLANK)
  const [sample, setSample] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  useEffect(() => {
    if (!open) return
    setDraft(
      rule
        ? {
            name: rule.name,
            description: rule.description,
            trigger: rule.trigger,
            conditions: rule.conditions,
            actions: rule.actions,
            enabled: rule.enabled,
            maxAttempts: rule.maxAttempts,
          }
        : BLANK,
    )
    setShowErrors(false)
    setSample(db.employees.find((e) => e.status === 'active')?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule])
  const errors = validateRule(draft, db)
  const save = useAction(() => saveRule(account, draft, rule?.id), rule ? 'Rule saved' : 'Rule created')
  const set = (p: Partial<RuleInput>) => setDraft((d) => ({ ...d, ...p }))
  const setCond = (i: number, p: Partial<RuleCondition>) => set({ conditions: draft.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)) })
  const setAct = (i: number, a: RuleAction) => set({ actions: draft.actions.map((x, j) => (j === i ? a : x)) })
  const fields = CONDITION_FIELDS.filter((f) => !f.triggers || f.triggers.includes(draft.trigger))
  const targets: Array<{ value: AssigneeTarget; label: string }> = [
    { value: 'employee', label: 'The employee' },
    { value: 'manager', label: 'Their manager' },
    { value: 'department_head', label: 'Department head' },
    { value: 'hr_queue', label: 'HR queue' },
    ...db.accounts.filter((a) => a.status === 'active' && a.role !== 'employee').map((a) => ({ value: `account:${a.id}` as AssigneeTarget, label: a.name })),
  ]

  // Dry run against a real employee, with event values filled from their latest matching record.
  const preview = useMemo(() => {
    const emp = db.employees.find((e) => e.id === sample)
    if (!emp) return null
    const req = db.requests.find((r) => r.employeeId === emp.id)
    const leave = db.leaveRequests.find((l) => l.employeeId === emp.id)
    const doc = emp.documents[0]
    const data: DomainEvent['data'] = {
      'request.category': req?.category ?? 'general',
      'request.type': db.requestTypes.find((t) => t.id === req?.typeId)?.name ?? '',
      subject: req?.subject ?? 'Sample subject',
      priority: req?.priority ?? 'normal',
      decision: 'approved',
      'leave.type': db.leaveTypes.find((t) => t.id === leave?.leaveTypeId)?.name ?? '',
      days: leave?.days ?? 1,
      'entity.type': 'request',
      daysOverdue: 2,
      document: doc?.name.replace(/\.\w+$/, '') ?? 'Document',
      'document.kind': doc?.kind ?? 'certificate',
      daysUntilExpiry: 20,
      date: emp.joinDate,
    }
    const asRule: WorkflowRule = { ...draft, id: rule?.id ?? 'preview', createdBy: account.id, createdAt: '', updatedAt: '', changeLog: [] }
    return previewRule(asRule, { type: draft.trigger, entity: { type: 'employee', id: emp.id }, employeeId: emp.id, actorId: null, data })
  }, [db, sample, draft, rule, account.id])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={rule ? 'Edit rule' : 'New rule'}
      description="When the trigger happens and every condition holds, the actions run once for that record."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.pending}
            onClick={async () => {
              setShowErrors(true)
              if (errors.length) return
              const r = await save.run()
              if (r.ok) onClose()
            }}
          >
            Save rule
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            {(a) => <Input {...a} value={draft.name} onChange={(e) => set({ name: e.target.value })} data-autofocus />}
          </Field>
          <Field label="Description" className="sm:col-span-2">
            {(a) => <Textarea {...a} rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />}
          </Field>
          <Field label="When (trigger)" hint={TRIGGERS.find((t) => t.value === draft.trigger)?.description}>
            {(a) => (
              <Select
                {...a}
                value={draft.trigger}
                onChange={(e) => set({ trigger: e.target.value as TriggerType })}
                options={TRIGGERS.map((t) => ({ value: t.value, label: `${t.label}${t.scheduled ? ' (scheduled)' : ''}` }))}
              />
            )}
          </Field>
          <Field label="Attempts if an action fails" hint="Failed runs are retried on the next scheduled pass.">
            {(a) => (
              <Select
                {...a}
                value={String(draft.maxAttempts)}
                onChange={(e) => set({ maxAttempts: Number(e.target.value) })}
                options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
              />
            )}
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-ink-soft mb-1 text-sm font-medium">Only if all of these are true</legend>
          {draft.conditions.length === 0 && <p className="text-muted text-sm">No conditions — runs for every matching event.</p>}
          {draft.conditions.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
              <Select
                aria-label={`Condition ${i + 1} field`}
                className="max-sm:col-span-2"
                value={c.field}
                onChange={(e) => setCond(i, { field: e.target.value })}
                options={fields.map((f) => ({ value: f.value, label: f.label }))}
              />
              <Select
                aria-label={`Condition ${i + 1} operator`}
                value={c.operator}
                onChange={(e) => setCond(i, { operator: e.target.value as RuleCondition['operator'] })}
                options={OPERATORS.map((o) => ({ value: o.value, label: o.label }))}
              />
              <Input aria-label={`Condition ${i + 1} value`} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} placeholder="Value" />
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
            onClick={() => set({ conditions: [...draft.conditions, { field: fields[0]?.value ?? 'employee.department', operator: 'equals', value: '' }] })}
          >
            Add condition
          </Button>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-ink-soft mb-1 text-sm font-medium">Then do this</legend>
          {draft.actions.map((a, i) => (
            <div key={i} className="border-line space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Select
                  aria-label={`Action ${i + 1} type`}
                  value={a.type}
                  onChange={(e) => setAct(i, DEFAULTS[e.target.value as RuleAction['type']])}
                  options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
                />
                <Button
                  variant="ghost"
                  iconOnly
                  icon={Trash2}
                  aria-label={`Remove action ${i + 1}`}
                  onClick={() => set({ actions: draft.actions.filter((_, j) => j !== i) })}
                />
              </div>
              {a.type === 'create_task' && (
                <div className="grid gap-2 sm:grid-cols-[2fr_1.2fr_0.7fr_0.9fr]">
                  <Input aria-label="Task title" value={a.title} onChange={(e) => setAct(i, { ...a, title: e.target.value })} />
                  <Select
                    aria-label="Assign to"
                    value={a.assignTo}
                    onChange={(e) => setAct(i, { ...a, assignTo: e.target.value as AssigneeTarget })}
                    options={targets}
                  />
                  <Input
                    aria-label="Due in days"
                    type="number"
                    min={0}
                    max={90}
                    value={a.dueInDays}
                    onChange={(e) => setAct(i, { ...a, dueInDays: Number(e.target.value) })}
                  />
                  <Select
                    aria-label="Priority"
                    value={a.priority}
                    onChange={(e) => setAct(i, { ...a, priority: e.target.value as Priority })}
                    options={['low', 'normal', 'high', 'urgent'].map((p) => ({ value: p, label: p }))}
                  />
                </div>
              )}
              {(a.type === 'notify' || a.type === 'send_email') && (
                <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                  <Select aria-label="Recipient" value={a.to} onChange={(e) => setAct(i, { ...a, to: e.target.value as AssigneeTarget })} options={targets} />
                  <Input
                    aria-label={a.type === 'notify' ? 'Title' : 'Subject'}
                    value={a.type === 'notify' ? a.title : a.subject}
                    onChange={(e) => setAct(i, a.type === 'notify' ? { ...a, title: e.target.value } : { ...a, subject: e.target.value })}
                  />
                  <Textarea
                    aria-label="Message"
                    rows={2}
                    className="sm:col-span-2"
                    value={a.type === 'notify' ? a.message : a.body}
                    onChange={(e) => setAct(i, a.type === 'notify' ? { ...a, message: e.target.value } : { ...a, body: e.target.value })}
                  />
                  {a.type === 'send_email' && (
                    <p className="text-warning text-xs sm:col-span-2">
                      No email provider is configured, so this action is recorded as skipped. Connect one in Integrations.
                    </p>
                  )}
                </div>
              )}
              {a.type === 'request_approval' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    aria-label="Request type"
                    value={a.requestTypeId}
                    onChange={(e) => setAct(i, { ...a, requestTypeId: e.target.value })}
                    placeholder="Request type with approvals"
                    options={db.requestTypes.filter((t) => t.approvalChain.length).map((t) => ({ value: t.id, label: t.name }))}
                  />
                  <Input aria-label="Subject" value={a.subject} onChange={(e) => setAct(i, { ...a, subject: e.target.value })} />
                </div>
              )}
              {a.type === 'update_employee' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    aria-label="Field"
                    value={a.field}
                    onChange={(e) => setAct(i, { ...a, field: e.target.value as 'status' })}
                    options={[
                      { value: 'status', label: 'Status' },
                      { value: 'scheduleId', label: 'Work schedule' },
                      { value: 'teamId', label: 'Team' },
                    ]}
                  />
                  {a.field === 'status' && (
                    <Select
                      aria-label="Value"
                      value={a.value}
                      onChange={(e) => setAct(i, { ...a, value: e.target.value })}
                      options={[
                        { value: 'active', label: 'Active' },
                        { value: 'on_leave', label: 'On leave' },
                      ]}
                    />
                  )}
                  {a.field === 'scheduleId' && (
                    <Select
                      aria-label="Value"
                      value={a.value}
                      onChange={(e) => setAct(i, { ...a, value: e.target.value })}
                      placeholder="Choose"
                      options={db.schedules.map((s) => ({ value: s.id, label: s.name }))}
                    />
                  )}
                  {a.field === 'teamId' && (
                    <Select
                      aria-label="Value"
                      value={a.value}
                      onChange={(e) => setAct(i, { ...a, value: e.target.value })}
                      placeholder="Choose"
                      options={db.teams.map((t) => ({ value: t.id, label: t.name }))}
                    />
                  )}
                </div>
              )}
              {a.type === 'start_lifecycle' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    aria-label="Checklist"
                    value={a.kind}
                    onChange={(e) => setAct(i, { ...a, kind: e.target.value as 'onboarding', templateId: null })}
                    options={[
                      { value: 'onboarding', label: 'Onboarding' },
                      { value: 'offboarding', label: 'Offboarding' },
                    ]}
                  />
                  <Select
                    aria-label="Template"
                    value={a.templateId ?? ''}
                    onChange={(e) => setAct(i, { ...a, templateId: e.target.value || null })}
                    placeholder="Best matching template"
                    options={db.lifecycleTemplates.filter((t) => t.kind === a.kind).map((t) => ({ value: t.id, label: t.name }))}
                  />
                </div>
              )}
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ actions: [...draft.actions, DEFAULTS.create_task] })}>
            Add action
          </Button>
          <p className="text-muted text-xs">Placeholders: {PLACEHOLDERS.join(' ')}</p>
        </fieldset>

        <Checkbox
          label="Enabled"
          description="Disabled rules keep their history but do not run."
          checked={draft.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />

        {showErrors && errors.length > 0 && (
          <ul role="alert" className="bg-danger-soft text-danger list-disc space-y-0.5 rounded-md py-2 pr-3 pl-7 text-sm">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <section className="bg-page border-line rounded-md border p-4" aria-label="Test run">
          <p className="text-sm font-semibold">Test against a real record</p>
          <p className="text-muted mb-3 text-xs">A dry run — nothing is created, sent or changed.</p>
          <Select
            aria-label="Sample employee"
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            options={db.employees.filter((e) => e.status !== 'terminated').map((e) => ({ value: e.id, label: fullName(e) }))}
          />
          {preview && (
            <div className="mt-3 text-sm" aria-live="polite">
              {preview.errors.length ? (
                <p className="text-warning">Fix the validation errors to test.</p>
              ) : preview.matches ? (
                <>
                  <p className="text-success flex items-center gap-1.5 font-medium">
                    <CheckCircle2 size={15} aria-hidden /> Would run
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                    {preview.run?.results.map((r, i) => (
                      <li key={i} className={r.outcome === 'skipped' ? 'text-warning' : ''}>
                        {r.message}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="text-ink-soft flex items-center gap-1.5 font-medium">
                    <XCircle size={15} aria-hidden /> Would not run
                  </p>
                  <ul className="text-muted mt-1 list-disc space-y-0.5 pl-5 text-xs">
                    {preview.failing.map((c, i) => (
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
        </section>
      </div>
    </Drawer>
  )
}
