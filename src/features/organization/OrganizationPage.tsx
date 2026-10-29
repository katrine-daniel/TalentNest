import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { isSupabaseConfigured } from '@/config/env'
import { ROLE_LABELS } from '@/domain/permissions'
import type { ApprovalStage, Database, LifecycleTemplateTask, Role } from '@/domain/types'
import { fullName } from '@/lib/utils'
import { changeRole, deleteConfig, saveConfig, updateOrganization, usageOf } from '@/services/organization'
import { OWNER_LABELS } from '@/services/lifecycle'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Form'
import { EmptyState, PageHeader, Panel, Tabs } from '@/components/ui/Layout'
import { Dialog } from '@/components/ui/Overlay'
import { CATEGORY_LABELS } from '@/features/shared/display'

type Collection = 'departments' | 'teams' | 'locations' | 'employmentTypes' | 'schedules' | 'holidays' | 'requestTypes' | 'leaveTypes' | 'lifecycleTemplates'
type Row = Record<string, unknown> & { id?: string }

interface FieldDef {
  key: string
  label: string
  kind: 'text' | 'number' | 'select' | 'checkbox' | 'textarea' | 'date' | 'weekdays' | 'chain' | 'tasks'
  options?: (db: Database) => Array<{ value: string; label: string }>
  hint?: string
  nullable?: boolean
}

interface Section {
  collection: Collection
  title: string
  description: string
  columns: Array<[string, (r: Row, db: Database) => React.ReactNode]>
  fields: FieldDef[]
  blank: (db: Database) => Row
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const RULES: Array<{ value: ApprovalStage['rule']; label: string }> = [
  { value: 'manager', label: 'Employee’s manager' },
  { value: 'department_head', label: 'Department head' },
  { value: 'hr', label: 'HR team' },
  { value: 'specific', label: 'A specific person' },
]
const empOptions = (db: Database) => db.employees.filter((e) => e.status !== 'terminated').map((e) => ({ value: e.id, label: fullName(e) }))
const nameOf = (list: Array<{ id: string; name: string }>, id: unknown) => list.find((x) => x.id === id)?.name ?? '—'

const SECTIONS: Section[] = [
  {
    collection: 'departments',
    title: 'Departments',
    description: 'Business units. The head is used for “department head” approvals.',
    columns: [
      ['Name', (r) => String(r.name)],
      ['Code', (r) => String(r.code ?? '')],
      [
        'Head',
        (r, db) => {
          const e = db.employees.find((x) => x.id === r.headEmployeeId)
          return e ? fullName(e) : '—'
        },
      ],
    ],
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'headEmployeeId', label: 'Head', kind: 'select', options: empOptions, nullable: true },
    ],
    blank: () => ({ name: '', code: '', headEmployeeId: null }),
  },
  {
    collection: 'teams',
    title: 'Teams',
    description: 'Optional groups within a department.',
    columns: [
      ['Name', (r) => String(r.name)],
      ['Department', (r, db) => nameOf(db.departments, r.departmentId)],
    ],
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'departmentId', label: 'Department', kind: 'select', options: (db) => db.departments.map((d) => ({ value: d.id, label: d.name })) },
      { key: 'leadEmployeeId', label: 'Lead', kind: 'select', options: empOptions, nullable: true },
    ],
    blank: (db) => ({ name: '', departmentId: db.departments[0]?.id ?? '', leadEmployeeId: null }),
  },
  {
    collection: 'locations',
    title: 'Locations',
    description: 'Sites, offices or properties. Holidays can apply to a single location.',
    columns: [
      ['Name', (r) => String(r.name)],
      ['City', (r) => String(r.city ?? '')],
      ['Country', (r) => String(r.country ?? '')],
    ],
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'city', label: 'City', kind: 'text' },
      { key: 'country', label: 'Country code', kind: 'text', hint: 'For display only — no country-specific rules are applied automatically.' },
      { key: 'timezone', label: 'Time zone', kind: 'text' },
    ],
    blank: () => ({ name: '', city: '', country: '', timezone: 'UTC' }),
  },
  {
    collection: 'employmentTypes',
    title: 'Employment types',
    description: 'Leave entitlements are pro-rated by FTE.',
    columns: [
      ['Name', (r) => String(r.name)],
      ['FTE', (r) => String(r.fte)],
    ],
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'fte', label: 'FTE (0–1)', kind: 'number' },
    ],
    blank: () => ({ name: '', fte: 1 }),
  },
  {
    collection: 'schedules',
    title: 'Work schedules',
    description: 'Working days decide which days leave is deducted for. Rotating rosters can be modelled as their usual working days.',
    columns: [
      ['Name', (r) => String(r.name)],
      ['Days', (r) => (r.workingDays as number[]).map((d) => WEEKDAYS[d]).join(', ')],
      ['Type', (r) => String(r.kind)],
    ],
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'workingDays', label: 'Working days', kind: 'weekdays' },
      { key: 'hoursPerDay', label: 'Hours per day', kind: 'number' },
      { key: 'kind', label: 'Type', kind: 'select', options: () => ['fixed', 'rotating', 'flexible'].map((v) => ({ value: v, label: v })) },
    ],
    blank: () => ({ name: '', workingDays: [1, 2, 3, 4, 5], hoursPerDay: 8, kind: 'fixed' }),
  },
  {
    collection: 'holidays',
    title: 'Holidays',
    description: 'Not deducted from leave. Enter holidays per location; nothing is pre-loaded for any country.',
    columns: [
      ['Date', (r) => String(r.date)],
      ['Name', (r) => String(r.name)],
      ['Applies to', (r, db) => (r.locationId ? nameOf(db.locations, r.locationId) : 'All locations')],
    ],
    fields: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'locationId', label: 'Location', kind: 'select', options: (db) => db.locations.map((l) => ({ value: l.id, label: l.name })), nullable: true },
    ],
    blank: () => ({ date: '', name: '', locationId: null }),
  },
  {
    collection: 'requestTypes',
    title: 'Request types',
    description: 'What employees can ask for, who approves it and the response target.',
    columns: [
      ['Name', (r) => String(r.name)],
      ['Category', (r) => CATEGORY_LABELS[String(r.category)] ?? String(r.category)],
      ['Approvals', (r) => (r.approvalChain as ApprovalStage[]).map((s) => s.name).join(' → ') || 'None'],
      ['Target', (r) => `${r.slaHours} h`],
      ['Status', (r) => <Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Inactive'}</Badge>],
    ],
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'category', label: 'Category', kind: 'select', options: () => Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })) },
      { key: 'description', label: 'Description', kind: 'textarea' },
      {
        key: 'kind',
        label: 'Kind',
        kind: 'select',
        options: () => [
          { value: 'service', label: 'Service request' },
          { value: 'equipment', label: 'Equipment' },
          { value: 'document', label: 'Document / letter' },
          { value: 'record_update', label: 'Personal detail update (applies changes on approval)' },
        ],
      },
      { key: 'slaHours', label: 'Response target (business hours)', kind: 'number' },
      {
        key: 'defaultPriority',
        label: 'Default priority',
        kind: 'select',
        options: () => ['low', 'normal', 'high', 'urgent'].map((v) => ({ value: v, label: v })),
      },
      { key: 'approvalChain', label: 'Approval chain', kind: 'chain' },
      { key: 'selfService', label: 'Employees can raise it themselves', kind: 'checkbox' },
      { key: 'active', label: 'Active', kind: 'checkbox' },
    ],
    blank: () => ({
      name: '',
      category: 'general',
      description: '',
      kind: 'service',
      slaHours: 24,
      defaultPriority: 'normal',
      approvalChain: [],
      selfService: true,
      active: true,
    }),
  },
  {
    collection: 'leaveTypes',
    title: 'Leave types',
    description: 'Entitlements and approval rules. Configure these to your contracts and the law where you employ people — nothing is assumed.',
    columns: [
      ['Name', (r) => String(r.name)],
      ['Entitlement', (r) => (r.tracked ? `${r.annualDays} days/yr` : 'Not tracked')],
      ['Carry-over', (r) => (r.tracked ? `${r.carryOverMax} days` : '—')],
      ['Approvals', (r) => (r.approvalChain as ApprovalStage[]).map((s) => s.name).join(' → ') || 'None'],
    ],
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'tracked', label: 'Track a yearly balance', kind: 'checkbox' },
      { key: 'annualDays', label: 'Days per year (full time)', kind: 'number' },
      { key: 'carryOverMax', label: 'Max carry-over days', kind: 'number' },
      { key: 'allowNegative', label: 'Allow negative balance', kind: 'checkbox' },
      { key: 'requiresAttachmentAfterDays', label: 'Ask for a document after (days)', kind: 'number', nullable: true, hint: 'Leave empty if never required.' },
      { key: 'approvalChain', label: 'Approval chain', kind: 'chain', hint: 'With no steps, leave is recorded without approval.' },
      { key: 'color', label: 'Colour', kind: 'text' },
      { key: 'active', label: 'Active', kind: 'checkbox' },
    ],
    blank: () => ({
      name: '',
      code: '',
      tracked: true,
      annualDays: 20,
      carryOverMax: 0,
      allowNegative: false,
      requiresAttachmentAfterDays: null,
      approvalChain: [{ id: 'st_mgr', name: 'Manager approval', rule: 'manager' }],
      color: '#4338CA',
      active: true,
    }),
  },
  {
    collection: 'lifecycleTemplates',
    title: 'Lifecycle templates',
    description: 'Onboarding and offboarding checklists. The most specific match (department, location, employment type) is suggested.',
    columns: [
      ['Name', (r) => String(r.name)],
      ['Kind', (r) => <Badge tone={r.kind === 'onboarding' ? 'info' : 'warning'}>{String(r.kind)}</Badge>],
      [
        'Applies to',
        (r, db) =>
          [
            r.departmentId && nameOf(db.departments, r.departmentId),
            r.locationId && nameOf(db.locations, r.locationId),
            r.employmentTypeId && nameOf(db.employmentTypes, r.employmentTypeId),
          ]
            .filter(Boolean)
            .join(' · ') || 'Everyone',
      ],
      ['Tasks', (r) => String((r.tasks as unknown[]).length)],
    ],
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      {
        key: 'kind',
        label: 'Kind',
        kind: 'select',
        options: () => [
          { value: 'onboarding', label: 'Onboarding' },
          { value: 'offboarding', label: 'Offboarding' },
        ],
      },
      {
        key: 'departmentId',
        label: 'Department',
        kind: 'select',
        options: (db) => db.departments.map((d) => ({ value: d.id, label: d.name })),
        nullable: true,
      },
      { key: 'locationId', label: 'Location', kind: 'select', options: (db) => db.locations.map((d) => ({ value: d.id, label: d.name })), nullable: true },
      {
        key: 'employmentTypeId',
        label: 'Employment type',
        kind: 'select',
        options: (db) => db.employmentTypes.map((d) => ({ value: d.id, label: d.name })),
        nullable: true,
      },
      { key: 'tasks', label: 'Tasks', kind: 'tasks' },
      { key: 'active', label: 'Active', kind: 'checkbox' },
    ],
    blank: () => ({
      name: '',
      kind: 'onboarding',
      departmentId: null,
      locationId: null,
      employmentTypeId: null,
      tasks: [{ id: 'new1', title: '', owner: 'hr', offsetDays: 0, requiresDocument: false, externalAction: false }],
      active: true,
    }),
  },
]

function Editor({ section, row, onClose }: { section: Section; row: Row; onClose: () => void }) {
  const db = useDb()
  const { account } = useSession()
  const [value, setValue] = useState<Row>(row)
  useEffect(() => setValue(row), [row])
  const save = useAction(() => saveConfig(account, section.collection, value as never), 'Saved')
  const set = (k: string, v: unknown) => setValue((x) => ({ ...x, [k]: v }))
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${row.id ? 'Edit' : 'Add'} ${section.title.toLowerCase().replace(/s$/, '')}`}
      size={section.fields.some((f) => f.kind === 'tasks' || f.kind === 'chain') ? 'lg' : 'md'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.pending} onClick={async () => (await save.run()).ok && onClose()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {section.fields.map((f) => {
          const v = value[f.key]
          if (f.kind === 'checkbox')
            return <Checkbox key={f.key} className="sm:col-span-2" label={f.label} checked={Boolean(v)} onChange={(e) => set(f.key, e.target.checked)} />
          if (f.kind === 'weekdays')
            return (
              <fieldset key={f.key} className="sm:col-span-2">
                <legend className="text-ink-soft mb-1 text-[13px] font-medium">{f.label}</legend>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAYS.map((d, i) => (
                    <Checkbox
                      key={d}
                      label={d}
                      checked={(v as number[]).includes(i)}
                      onChange={(e) => set(f.key, e.target.checked ? [...(v as number[]), i].sort() : (v as number[]).filter((x) => x !== i))}
                    />
                  ))}
                </div>
              </fieldset>
            )
          if (f.kind === 'chain') {
            const chain = v as ApprovalStage[]
            return (
              <fieldset key={f.key} className="space-y-2 sm:col-span-2">
                <legend className="text-ink-soft mb-1 text-[13px] font-medium">{f.label}</legend>
                {f.hint && <p className="text-muted text-xs">{f.hint}</p>}
                {chain.map((s, i) => (
                  <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                    <span className="text-muted tabular text-xs">{i + 1}.</span>
                    <Input
                      aria-label={`Step ${i + 1} name`}
                      value={s.name}
                      onChange={(e) =>
                        set(
                          f.key,
                          chain.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                        )
                      }
                    />
                    <Select
                      aria-label={`Step ${i + 1} approver`}
                      value={s.rule}
                      onChange={(e) =>
                        set(
                          f.key,
                          chain.map((x, j) => (j === i ? { ...x, rule: e.target.value as ApprovalStage['rule'], accountId: null } : x)),
                        )
                      }
                      options={RULES}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      icon={Trash2}
                      aria-label={`Remove step ${i + 1}`}
                      onClick={() =>
                        set(
                          f.key,
                          chain.filter((_, j) => j !== i),
                        )
                      }
                    />
                    {s.rule === 'specific' && (
                      <Select
                        aria-label={`Step ${i + 1} person`}
                        className="col-span-2 col-start-2"
                        value={s.accountId ?? ''}
                        onChange={(e) =>
                          set(
                            f.key,
                            chain.map((x, j) => (j === i ? { ...x, accountId: e.target.value } : x)),
                          )
                        }
                        placeholder="Choose person"
                        options={db.accounts.filter((a) => a.status === 'active').map((a) => ({ value: a.id, label: a.name }))}
                      />
                    )}
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Plus}
                  onClick={() => set(f.key, [...chain, { id: `st_${Date.now()}`, name: 'Approval', rule: 'manager' }])}
                >
                  Add step
                </Button>
                <p className="text-muted text-xs">Nobody can approve a request they raised or that is about themselves; such steps fall back to HR.</p>
              </fieldset>
            )
          }
          if (f.kind === 'tasks') {
            const tasks = v as LifecycleTemplateTask[]
            return (
              <fieldset key={f.key} className="space-y-2 sm:col-span-2">
                <legend className="text-ink-soft mb-1 text-[13px] font-medium">{f.label} — day offset is relative to the joining date / last day</legend>
                {tasks.map((t, i) => {
                  const upd = (p: Partial<LifecycleTemplateTask>) =>
                    set(
                      f.key,
                      tasks.map((x, j) => (j === i ? { ...x, ...p } : x)),
                    )
                  return (
                    <div key={i} className="border-line grid gap-2 rounded-md border p-2 sm:grid-cols-[2fr_1fr_5rem_auto]">
                      <Input aria-label={`Task ${i + 1} title`} value={t.title} onChange={(e) => upd({ title: e.target.value })} placeholder="Task" />
                      <Select
                        aria-label={`Task ${i + 1} owner`}
                        value={t.owner}
                        onChange={(e) => upd({ owner: e.target.value as LifecycleTemplateTask['owner'] })}
                        options={Object.entries(OWNER_LABELS).map(([value, label]) => ({ value, label }))}
                      />
                      <Input
                        aria-label={`Task ${i + 1} day offset`}
                        type="number"
                        value={t.offsetDays}
                        onChange={(e) => upd({ offsetDays: Math.round(Number(e.target.value)) })}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        icon={Trash2}
                        aria-label={`Remove task ${i + 1}`}
                        onClick={() =>
                          set(
                            f.key,
                            tasks.filter((_, j) => j !== i),
                          )
                        }
                      />
                      <div className="flex flex-wrap gap-4 sm:col-span-4">
                        <Checkbox label="Needs a document" checked={t.requiresDocument} onChange={(e) => upd({ requiresDocument: e.target.checked })} />
                        <Checkbox label="Action in an external system" checked={t.externalAction} onChange={(e) => upd({ externalAction: e.target.checked })} />
                      </div>
                    </div>
                  )
                })}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Plus}
                  onClick={() =>
                    set(f.key, [...tasks, { id: `t_${Date.now()}`, title: '', owner: 'hr', offsetDays: 0, requiresDocument: false, externalAction: false }])
                  }
                >
                  Add task
                </Button>
              </fieldset>
            )
          }
          return (
            <Field key={f.key} label={f.label} hint={f.hint} className={f.kind === 'textarea' ? 'sm:col-span-2' : ''}>
              {(a) =>
                f.kind === 'select' ? (
                  <Select
                    {...a}
                    value={(v as string) ?? ''}
                    onChange={(e) => set(f.key, e.target.value || (f.nullable ? null : ''))}
                    placeholder={f.nullable ? 'Any / none' : undefined}
                    options={f.options?.(db) ?? []}
                  />
                ) : f.kind === 'textarea' ? (
                  <Textarea {...a} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <Input
                    {...a}
                    type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
                    step={f.kind === 'number' ? 'any' : undefined}
                    value={v === null || v === undefined ? '' : String(v)}
                    onChange={(e) =>
                      set(f.key, f.kind === 'number' ? (e.target.value === '' ? (f.nullable ? null : 0) : Number(e.target.value)) : e.target.value)
                    }
                  />
                )
              }
            </Field>
          )
        })}
      </div>
    </Dialog>
  )
}

function ConfigSection({ section }: { section: Section }) {
  const db = useDb()
  const { account } = useSession()
  const [editing, setEditing] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState<Row | null>(null)
  const remove = useAction((id: string) => deleteConfig(account, section.collection, id), 'Deleted')
  const rows = db[section.collection] as unknown as Row[]
  return (
    <Panel
      title={section.title}
      actions={
        <Button size="sm" icon={Plus} onClick={() => setEditing(section.blank(db))}>
          Add
        </Button>
      }
    >
      <p className="text-muted border-line border-b px-4 py-2.5 text-xs">{section.description}</p>
      {rows.length ? (
        <div className="relative scrollbar-thin overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{section.title}</caption>
            <thead>
              <tr className="border-line border-b">
                {section.columns.map(([h]) => (
                  <th key={h} scope="col" className="text-muted px-4 py-2 text-left text-xs font-medium">
                    {h}
                  </th>
                ))}
                <th scope="col" className="text-muted px-4 py-2 text-right text-xs font-medium">
                  In use
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const used = usageOf(db, section.collection, r.id as string)
                return (
                  <tr key={r.id} className="border-line border-b last:border-0">
                    {section.columns.map(([h, cell]) => (
                      <td key={h} className="px-4 py-2">
                        {cell(r, db)}
                      </td>
                    ))}
                    <td className="tabular text-muted px-4 py-2 text-right">{used || '—'}</td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        icon={Pencil}
                        aria-label={`Edit ${String(r.name ?? r.date)}`}
                        onClick={() => setEditing(structuredClone(r))}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        icon={Trash2}
                        aria-label={`Delete ${String(r.name ?? r.date)}`}
                        disabled={used > 0}
                        title={used ? 'In use — reassign or deactivate instead' : undefined}
                        onClick={() => setDeleting(r)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={`No ${section.title.toLowerCase()} yet`} compact />
      )}
      {editing && <Editor section={section} row={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${String(deleting?.name ?? deleting?.date ?? '')}?`}
        tone="danger"
        confirmLabel="Delete"
        loading={remove.pending}
        onConfirm={async () => {
          if (!deleting) return
          const r = await remove.run(deleting.id as string)
          if (r.ok) setDeleting(null)
        }}
      />
    </Panel>
  )
}

function Profile() {
  const db = useDb()
  const { account } = useSession()
  const [org, setOrg] = useState(db.organization)
  const save = useAction(
    () =>
      updateOrganization(account, {
        name: org.name,
        industry: org.industry,
        timezone: org.timezone,
        country: org.country,
        weekStartsOn: org.weekStartsOn,
        terminology: org.terminology,
      }),
    'Company profile saved',
  )
  return (
    <Panel title="Company profile" bodyClassName="p-5">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Field label="Company name">{(a) => <Input {...a} value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} />}</Field>
        <Field label="Industry" hint="Informational; behaviour comes from the configuration below, not the industry.">
          {(a) => <Input {...a} value={org.industry} onChange={(e) => setOrg({ ...org, industry: e.target.value })} />}
        </Field>
        <Field label="Primary time zone">{(a) => <Input {...a} value={org.timezone} onChange={(e) => setOrg({ ...org, timezone: e.target.value })} />}</Field>
        <Field label="Week starts on">
          {(a) => (
            <Select
              {...a}
              value={String(org.weekStartsOn)}
              onChange={(e) => setOrg({ ...org, weekStartsOn: Number(e.target.value) as 0 | 1 })}
              options={[
                { value: '1', label: 'Monday' },
                { value: '0', label: 'Sunday' },
              ]}
            />
          )}
        </Field>
        <Field label="Term for “employee”" hint="e.g. team member, associate, colleague">
          {(a) => (
            <Input
              {...a}
              value={org.terminology.employee}
              onChange={(e) => setOrg({ ...org, terminology: { ...org.terminology, employee: e.target.value } })}
            />
          )}
        </Field>
        <Field label="Term for “location”" hint="e.g. property, store, site, campus">
          {(a) => (
            <Input
              {...a}
              value={org.terminology.location}
              onChange={(e) => setOrg({ ...org, terminology: { ...org.terminology, location: e.target.value } })}
            />
          )}
        </Field>
      </div>
      <p className="text-muted mt-4 max-w-3xl text-xs">
        Payroll, tax and employment-law rules are country-specific and are not built in. Leave types, holidays and approval rules must be configured and
        validated for each country where you employ people.
      </p>
      <Button variant="primary" className="mt-4" loading={save.pending} onClick={() => save.run()}>
        Save profile
      </Button>
    </Panel>
  )
}

function Users() {
  const db = useDb()
  const { account, can } = useSession()
  const change = useAction((id: string, role: Role) => changeRole(account, id, role), 'Role updated')
  const [inviting, setInviting] = useState(false)
  const [invite, setInvite] = useState({ email: '', fullName: '', role: 'employee', employeeId: '' })
  const send = useAction(
    async () => (await import('@/services/supabaseSession')).inviteMember({ ...invite, employeeId: invite.employeeId || null }),
    'Invitation sent — the person appears here after they accept and you reload',
  )
  const linked = new Set(db.accounts.map((a) => a.employeeId))
  return (
    <Panel
      title="Users & roles"
      actions={
        isSupabaseConfigured &&
        can('accounts.manage') && (
          <Button size="sm" icon={Plus} onClick={() => setInviting(true)}>
            Invite
          </Button>
        )
      }
    >
      <p className="text-muted border-line border-b px-4 py-2.5 text-xs">
        Roles decide what each person can see and do; the same rules are enforced by the database when Supabase is connected.{' '}
        {isSupabaseConfigured
          ? 'Invitations are sent by the invite-member Edge Function.'
          : 'The demo workspace has a fixed set of fictional accounts; invitations need Supabase.'}
      </p>
      <Dialog
        open={inviting}
        onClose={() => setInviting(false)}
        title="Invite a person"
        size="sm"
        footer={
          <>
            <Button onClick={() => setInviting(false)}>Cancel</Button>
            <Button variant="primary" loading={send.pending} disabled={!invite.email.trim()} onClick={async () => (await send.run()).ok && setInviting(false)}>
              Send invitation
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Email" required>
            {(a) => <Input {...a} type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />}
          </Field>
          <Field label="Full name">
            {(a) => <Input {...a} value={invite.fullName} onChange={(e) => setInvite({ ...invite, fullName: e.target.value })} />}
          </Field>
          <Field label="Role">
            {(a) => (
              <Select
                {...a}
                value={invite.role}
                onChange={(e) => setInvite({ ...invite, role: e.target.value })}
                options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))}
              />
            )}
          </Field>
          <Field label="Employee record" hint="Links the account to their record so they see their own requests and leave.">
            {(a) => (
              <Select
                {...a}
                value={invite.employeeId}
                onChange={(e) => setInvite({ ...invite, employeeId: e.target.value })}
                placeholder="Not linked"
                options={db.employees.filter((e) => e.status !== 'terminated' && !linked.has(e.id)).map((e) => ({ value: e.id, label: fullName(e) }))}
              />
            )}
          </Field>
        </div>
      </Dialog>
      <div className="relative scrollbar-thin overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Users</caption>
          <thead>
            <tr className="border-line border-b">
              <th scope="col" className="text-muted px-4 py-2 text-left text-xs font-medium">
                Name
              </th>
              <th scope="col" className="text-muted px-4 py-2 text-left text-xs font-medium">
                Email
              </th>
              <th scope="col" className="text-muted px-4 py-2 text-left text-xs font-medium">
                Role
              </th>
              <th scope="col" className="text-muted px-4 py-2 text-left text-xs font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {db.accounts.map((a) => (
              <tr key={a.id} className="border-line border-b last:border-0">
                <td className="px-4 py-2">{a.name}</td>
                <td className="text-muted px-4 py-2">{a.email}</td>
                <td className="px-4 py-1.5">
                  {can('accounts.manage') && a.id !== account.id ? (
                    <Select
                      aria-label={`Role for ${a.name}`}
                      className="h-8 w-auto"
                      value={a.role}
                      onChange={(e) => change.run(a.id, e.target.value as Role)}
                      options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))}
                    />
                  ) : (
                    ROLE_LABELS[a.role]
                  )}
                </td>
                <td className="px-4 py-2">
                  <Badge tone={a.status === 'active' ? 'success' : 'neutral'}>{a.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

const TABS = [
  { value: 'profile', label: 'Company' },
  { value: 'structure', label: 'Structure' },
  { value: 'time', label: 'Schedules & holidays' },
  { value: 'requests', label: 'Request types' },
  { value: 'leave', label: 'Leave types' },
  { value: 'templates', label: 'Lifecycle templates' },
  { value: 'users', label: 'Users & roles' },
]
const BY_TAB: Record<string, Collection[]> = {
  structure: ['departments', 'teams', 'locations', 'employmentTypes'],
  time: ['schedules', 'holidays'],
  requests: ['requestTypes'],
  leave: ['leaveTypes'],
  templates: ['lifecycleTemplates'],
}

export default function OrganizationPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? (params.get('tab') as string) : 'profile'
  return (
    <div>
      <PageHeader
        title="Organization"
        description="Configure the structure, schedules, request and leave rules and checklists your company runs on — the same product works across industries through configuration."
      />
      <Tabs label="Organization settings" tabs={TABS} value={tab} onChange={(v) => setParams({ tab: v })} className="mb-5" />
      <div className="space-y-5">
        {tab === 'profile' && <Profile />}
        {tab === 'users' && <Users />}
        {(BY_TAB[tab] ?? []).map((c) => (
          <ConfigSection key={c} section={SECTIONS.find((s) => s.collection === c) as Section} />
        ))}
      </div>
    </div>
  )
}
