import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, UserRoundCheck } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import type { LifecycleCase, LifecycleKind } from '@/domain/types'
import { formatDate } from '@/lib/dates'
import { fullName } from '@/lib/utils'
import { caseProgress, startLifecycle, suggestTemplate, visibleCases } from '@/services/lifecycle'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Form'
import { EmptyState, PageHeader, Panel, Tabs } from '@/components/ui/Layout'
import { Dialog } from '@/components/ui/Overlay'
import { Table } from '@/components/ui/Table'
import { PersonCell } from '@/features/shared/display'

function StartDialog({ kind, onClose }: { kind: LifecycleKind | null; onClose: () => void }) {
  const db = useDb()
  const { account } = useSession()
  const navigate = useNavigate()
  const [employeeId, setEmployeeId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [date, setDate] = useState('')
  const candidates = db.employees.filter(
    (e) =>
      (kind === 'onboarding' ? ['pre_boarding', 'active'].includes(e.status) : ['active', 'on_leave', 'offboarding'].includes(e.status)) &&
      !db.lifecycleCases.some((c) => c.employeeId === e.id && c.kind === kind && c.status === 'active'),
  )
  const employee = db.employees.find((e) => e.id === employeeId)
  const suggested = employee && kind ? suggestTemplate(db.lifecycleTemplates, kind, employee) : undefined
  useEffect(() => {
    setTemplateId(suggested?.id ?? '')
    setDate(employee ? ((kind === 'onboarding' ? employee.joinDate : employee.endDate) ?? '') : '')
  }, [employeeId, suggested?.id, employee, kind])
  useEffect(() => {
    if (kind) setEmployeeId('')
  }, [kind])
  const start = useAction(
    () => startLifecycle(account, kind as LifecycleKind, employeeId, templateId || null, date),
    (c: LifecycleCase) => `${c.kind === 'onboarding' ? 'Onboarding' : 'Offboarding'} started`,
  )
  return (
    <Dialog
      open={Boolean(kind)}
      onClose={onClose}
      title={kind === 'onboarding' ? 'Start onboarding' : 'Start offboarding'}
      description="Tasks are created from the template with due dates relative to the key date and assigned to their owners."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!employeeId || !templateId || !date}
            loading={start.pending}
            onClick={async () => {
              const r = await start.run()
              if (r.ok) {
                onClose()
                navigate(`/lifecycle/${r.value.id}`)
              }
            }}
          >
            Start checklist
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Employee" required>
          {(a) => (
            <Select
              {...a}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="Choose…"
              options={candidates.map((e) => ({ value: e.id, label: `${fullName(e)} — ${e.title}` }))}
            />
          )}
        </Field>
        <Field
          label="Template"
          required
          hint={
            suggested
              ? `Suggested: ${suggested.name} (best match for department, location and type)`
              : employee
                ? 'No template matches this employee — choose one.'
                : undefined
          }
        >
          {(a) => (
            <Select
              {...a}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="Choose…"
              options={db.lifecycleTemplates
                .filter((t) => t.kind === kind && t.active)
                .map((t) => ({ value: t.id, label: `${t.name} (${t.tasks.length} tasks)` }))}
            />
          )}
        </Field>
        <Field label={kind === 'onboarding' ? 'Joining date' : 'Last working day'} required>
          {(a) => <Input {...a} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

export default function LifecyclePage() {
  const db = useDb()
  const { account, can } = useSession()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('active')
  const [starting, setStarting] = useState<LifecycleKind | null>(null)
  useEffect(() => {
    const s = params.get('start')
    if ((s === 'onboarding' || s === 'offboarding') && can('lifecycle.manage')) {
      setStarting(s)
      setParams({}, { replace: true })
    }
  }, [params, setParams, can])
  const cases = useMemo(() => visibleCases(db, account), [db, account])
  const rows = cases
    .filter((c) =>
      tab === 'active'
        ? c.status === 'active'
        : tab === 'onboarding' || tab === 'offboarding'
          ? c.kind === tab && c.status === 'active'
          : c.status !== 'active',
    )
    .sort((a, b) => a.keyDate.localeCompare(b.keyDate))

  return (
    <div>
      <PageHeader
        title="Onboarding & Offboarding"
        description="Checklists for joiners and leavers built from reusable templates. Tasks that change external systems are confirmed by people — PeopleOS does not perform them unless an integration is connected."
        actions={
          can('lifecycle.manage') && (
            <>
              <Button icon={Plus} onClick={() => setStarting('offboarding')}>
                Start offboarding
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setStarting('onboarding')}>
                Start onboarding
              </Button>
            </>
          )
        }
      />
      <Panel>
        <div className="px-4 pt-1">
          <Tabs
            label="Checklist views"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'active', label: 'Active', count: cases.filter((c) => c.status === 'active').length },
              { value: 'onboarding', label: 'Onboarding', count: cases.filter((c) => c.kind === 'onboarding' && c.status === 'active').length },
              { value: 'offboarding', label: 'Offboarding', count: cases.filter((c) => c.kind === 'offboarding' && c.status === 'active').length },
              { value: 'closed', label: 'Completed & cancelled' },
            ]}
          />
        </div>
        <Table
          caption="Onboarding and offboarding checklists"
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/lifecycle/${c.id}`)}
          empty={<EmptyState icon={UserRoundCheck} title="No checklists here" />}
          columns={[
            { key: 'emp', header: 'Employee', cell: (c) => <PersonCell employee={db.employees.find((e) => e.id === c.employeeId)} /> },
            {
              key: 'kind',
              header: 'Type',
              cell: (c) => <Badge tone={c.kind === 'onboarding' ? 'info' : 'warning'}>{c.kind === 'onboarding' ? 'Onboarding' : 'Offboarding'}</Badge>,
            },
            { key: 'date', header: 'Key date', hideBelow: 'sm', cell: (c) => <span className="tabular">{formatDate(c.keyDate)}</span> },
            {
              key: 'progress',
              header: 'Progress',
              cell: (c) => {
                const p = caseProgress(c)
                return (
                  <span className="flex items-center gap-2">
                    <span
                      className="bg-subtle h-1.5 w-20 overflow-hidden rounded-full"
                      role="progressbar"
                      aria-valuenow={p.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Progress"
                    >
                      <span className="bg-brand-600 block h-full" style={{ width: `${p.percent}%` }} />
                    </span>
                    <span className="tabular text-xs">
                      {p.done}/{p.total}
                    </span>
                    {p.overdue > 0 && <Badge tone="danger">{p.overdue} overdue</Badge>}
                  </span>
                )
              },
            },
            { key: 'tpl', header: 'Template', hideBelow: 'lg', cell: (c) => db.lifecycleTemplates.find((t) => t.id === c.templateId)?.name ?? '—' },
            {
              key: 'open',
              header: <span className="sr-only">Open</span>,
              cell: (c) => (
                <Link className="text-brand-700 text-xs font-medium hover:underline" to={`/lifecycle/${c.id}`}>
                  Open
                </Link>
              ),
            },
          ]}
        />
      </Panel>
      {can('org.manage') && (
        <p className="text-muted mt-3 text-xs">
          Templates are managed in{' '}
          <Link className="text-brand-700 hover:underline" to="/organization?tab=templates">
            Organization → Lifecycle templates
          </Link>
          .
        </p>
      )}
      <StartDialog kind={starting} onClose={() => setStarting(null)} />
    </div>
  )
}
