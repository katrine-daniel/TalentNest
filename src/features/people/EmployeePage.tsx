import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, FileText, Lock, Pencil, Plus, Trash2, UserMinus, UserRoundCheck } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { leaveBalance } from '@/domain/leave'
import { canViewEmploymentDetails, canViewSensitive } from '@/domain/permissions'
import type { Employee, EmployeeDocument } from '@/domain/types'
import { addDays, formatDate, formatDateTime, today } from '@/lib/dates'
import { fullName } from '@/lib/utils'
import { addDocument, assignEquipment, deactivateEmployee, erasePersonalData, removeDocument, returnEquipment, setEmergencyContact } from '@/services/employees'
import { files } from '@/services/files'
import { adjustBalance, visibleLeave } from '@/services/leave'
import { startLifecycle } from '@/services/lifecycle'
import { visibleRequests } from '@/services/requests'
import { Badge } from '@/components/ui/Badge'
import { Button, LinkButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field, Input, Select } from '@/components/ui/Form'
import { Avatar, EmptyState, KeyValue, Panel, Tabs } from '@/components/ui/Layout'
import { Dialog } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { EmployeeStatusBadge, LeaveStatusBadge, RequestStatusBadge } from '@/features/shared/display'
import { EmployeeForm } from './EmployeeForm'

function Hidden({ label = 'Restricted' }: { label?: string }) {
  return (
    <span className="text-muted inline-flex items-center gap-1 text-xs">
      <Lock size={12} aria-hidden /> {label}
    </span>
  )
}

function DocumentsTab({ employee, manage }: { employee: Employee; manage: boolean }) {
  const { account } = useSession()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<EmployeeDocument['kind']>('other')
  const [expires, setExpires] = useState('')
  const add = useAction(() => addDocument(account, employee.id, file as File, kind, expires || null), 'Document uploaded')
  const remove = useAction((id: string) => removeDocument(account, employee.id, id), 'Document removed')
  const openFile = async (d: EmployeeDocument) => {
    if (!d.fileId) return toast.info('This sample record has no file attached.')
    try {
      window.open(await files.open(d.fileId), '_blank', 'noopener')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open the file.')
    }
  }
  return (
    <Panel
      title="Documents"
      actions={
        manage && (
          <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
            Upload
          </Button>
        )
      }
    >
      {employee.documents.length ? (
        <ul className="divide-line divide-y">
          {employee.documents.map((d) => {
            const expiring = d.expiresOn && d.expiresOn <= addDays(today(), 30)
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <FileText size={16} className="text-muted shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <button type="button" className="hover:underline" onClick={() => void openFile(d)}>
                    {d.name}
                  </button>
                  <span className="text-muted block text-xs">
                    {d.kind.replace('_', ' ')} · uploaded {formatDate(d.uploadedAt)}
                    {d.expiresOn && <> · expires {formatDate(d.expiresOn)}</>}
                  </span>
                </span>
                {expiring && <Badge tone={d.expiresOn! < today() ? 'danger' : 'warning'}>{d.expiresOn! < today() ? 'Expired' : 'Expiring soon'}</Badge>}
                {manage && <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Remove ${d.name}`} onClick={() => remove.run(d.id)} />}
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState icon={FileText} title="No documents on file" compact />
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Upload document"
        size="sm"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!file}
              loading={add.pending}
              onClick={async () => {
                const r = await add.run()
                if (r.ok) {
                  setOpen(false)
                  setFile(null)
                }
              }}
            >
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="File" required hint="PDF, Word or image, up to 10 MB. Stored privately.">
            {(a) => (
              <input {...a} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            )}
          </Field>
          <Field label="Type">
            {(a) => (
              <Select
                {...a}
                value={kind}
                onChange={(e) => setKind(e.target.value as EmployeeDocument['kind'])}
                options={['contract', 'id_proof', 'certificate', 'letter', 'other'].map((k) => ({ value: k, label: k.replace('_', ' ') }))}
              />
            )}
          </Field>
          <Field label="Expires on" hint="Optional — expiry reminders can be automated.">
            {(a) => <Input {...a} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />}
          </Field>
        </div>
      </Dialog>
    </Panel>
  )
}

function EquipmentTab({ employee, manage }: { employee: Employee; manage: boolean }) {
  const { account } = useSession()
  const [item, setItem] = useState('')
  const [tag, setTag] = useState('')
  const assign = useAction(() => assignEquipment(account, employee.id, item, tag), 'Equipment assigned')
  const ret = useAction((id: string) => returnEquipment(account, employee.id, id), 'Marked as returned')
  return (
    <Panel title="Equipment">
      {employee.equipment.length ? (
        <ul className="divide-line divide-y">
          {employee.equipment.map((q) => (
            <li key={q.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex-1">
                {q.item} <span className="text-muted">· {q.assetTag}</span>
                <span className="text-muted block text-xs">
                  Assigned {formatDate(q.assignedOn)}
                  {q.returnedOn && ` · returned ${formatDate(q.returnedOn)}`}
                </span>
              </span>
              {!q.returnedOn && manage && (
                <Button size="sm" onClick={() => ret.run(q.id)}>
                  Mark returned
                </Button>
              )}
              {q.returnedOn && <Badge>Returned</Badge>}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No equipment assigned" compact />
      )}
      {manage && (
        <form
          className="border-line flex flex-wrap items-end gap-2 border-t px-4 py-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await assign.run()
            if (r.ok) {
              setItem('')
              setTag('')
            }
          }}
        >
          <Field label="Item" className="min-w-40 flex-1">
            {(a) => <Input {...a} value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. Laptop" />}
          </Field>
          <Field label="Asset tag" className="w-36">
            {(a) => <Input {...a} value={tag} onChange={(e) => setTag(e.target.value)} />}
          </Field>
          <Button type="submit" loading={assign.pending}>
            Assign
          </Button>
        </form>
      )}
    </Panel>
  )
}

export default function EmployeePage() {
  const { employeeId } = useParams()
  const db = useDb()
  const { account, can } = useSession()
  const [tab, setTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [endDate, setEndDate] = useState(addDays(today(), 14))
  const [erase, setErase] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [contact, setContact] = useState({ name: '', relationship: '', phone: '' })
  const [adjust, setAdjust] = useState<{ type: string; days: string; reason: string } | null>(null)
  const e = db.employees.find((x) => x.id === employeeId)

  const deactivate = useAction((reason: string) => deactivateEmployee(account, e?.id as string, endDate, reason), 'Record updated')
  const offboard = useAction(() => startLifecycle(account, 'offboarding', e?.id as string, null), 'Offboarding started')
  const onboard = useAction(() => startLifecycle(account, 'onboarding', e?.id as string, null), 'Onboarding started')
  const eraseAction = useAction(() => erasePersonalData(account, e?.id as string), 'Personal data erased')
  const saveContact = useAction(() => setEmergencyContact(account, e?.id as string, contact.name ? contact : null), 'Emergency contact saved')
  const adjustAction = useAction(
    () => adjustBalance(account, e?.id as string, adjust?.type as string, new Date().getFullYear(), Number(adjust?.days), adjust?.reason ?? ''),
    'Balance adjusted',
  )

  if (!e) return <EmptyState title="Employee not found" action={<LinkButton to="/people">Back to People</LinkButton>} />
  const sensitive = canViewSensitive(account, e)
  const details = canViewEmploymentDetails(account, e, db)
  const manage = can('people.manage')
  const isSelf = account.employeeId === e.id
  const name = (list: Array<{ id: string; name: string }>, id: string | null) => list.find((x) => x.id === id)?.name ?? '—'
  const manager = db.employees.find((x) => x.id === e.managerId)
  const reports = db.employees.filter((x) => x.managerId === e.id && x.status !== 'terminated')
  const cases = db.lifecycleCases.filter((c) => c.employeeId === e.id)
  const activeCase = (k: 'onboarding' | 'offboarding') => cases.find((c) => c.kind === k && c.status === 'active')
  const year = new Date().getFullYear()
  const leaves = visibleLeave(db, account).filter((l) => l.employeeId === e.id)
  const requests = visibleRequests(db, account).filter((r) => r.employeeId === e.id)

  const tabs = [
    { value: 'overview', label: 'Overview' },
    ...(details
      ? [
          { value: 'timeoff', label: 'Time off' },
          { value: 'documents', label: 'Documents', count: e.documents.length },
          { value: 'equipment', label: 'Equipment' },
          { value: 'requests', label: 'Requests', count: requests.length },
          { value: 'history', label: 'History' },
        ]
      : []),
  ]

  return (
    <div>
      <Link to="/people" className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={14} aria-hidden /> People
      </Link>
      <div className="border-line bg-surface shadow-card mb-5 flex flex-col gap-4 rounded-lg border p-5 sm:flex-row sm:items-center">
        <Avatar name={fullName(e)} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{fullName(e)}</h1>
            {details && <EmployeeStatusBadge status={e.status} />}
          </div>
          <p className="text-ink-soft text-sm">
            {e.title} · {name(db.departments, e.departmentId)} · {name(db.locations, e.locationId)}
          </p>
          <p className="text-muted text-xs">
            {e.employeeNo} ·{' '}
            <a className="hover:underline" href={`mailto:${e.workEmail}`}>
              {e.workEmail}
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manage && (
            <Button icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          {isSelf && !manage && (
            <LinkButton to="/requests/new?type=rt_update" icon={Pencil}>
              Request a change
            </LinkButton>
          )}
          {can('lifecycle.manage') && e.status === 'pre_boarding' && !activeCase('onboarding') && (
            <Button icon={UserRoundCheck} loading={onboard.pending} onClick={() => onboard.run()}>
              Start onboarding
            </Button>
          )}
          {manage && ['active', 'on_leave', 'pre_boarding'].includes(e.status) && (
            <Button icon={UserMinus} onClick={() => setDeactivating(true)}>
              Record departure
            </Button>
          )}
          {can('lifecycle.manage') && e.status === 'offboarding' && !activeCase('offboarding') && (
            <Button loading={offboard.pending} onClick={() => offboard.run()}>
              Start offboarding
            </Button>
          )}
        </div>
      </div>

      <Tabs label="Employee sections" tabs={tabs} value={tab} onChange={setTab} className="mb-5" />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="Work profile" bodyClassName="p-4">
            <KeyValue
              items={[
                ['Job title', e.title],
                ['Department', name(db.departments, e.departmentId)],
                ['Team', name(db.teams, e.teamId)],
                [
                  'Manager',
                  manager ? (
                    <Link className="hover:underline" to={`/people/${manager.id}`}>
                      {fullName(manager)}
                    </Link>
                  ) : (
                    '—'
                  ),
                ],
                ['Location', name(db.locations, e.locationId)],
                ['Employment type', details ? name(db.employmentTypes, e.employmentTypeId) : <Hidden />],
                ['Work schedule', details ? name(db.schedules, e.scheduleId) : <Hidden />],
                ['Joining date', formatDate(e.joinDate)],
                ...(e.endDate && details ? ([['Last working day', formatDate(e.endDate)]] as Array<[string, string]>) : []),
              ]}
            />
          </Panel>
          <Panel title="Personal & contact" bodyClassName="p-4" actions={!sensitive && <Hidden label="Visible to HR and the employee" />}>
            <KeyValue
              items={[
                ['Work email', e.workEmail],
                ['Personal email', sensitive ? (e.personalEmail ?? '—') : <Hidden />],
                ['Phone', sensitive ? (e.phone ?? '—') : <Hidden />],
                ['Date of birth', sensitive ? formatDate(e.dateOfBirth) : <Hidden />],
                [
                  'Emergency contact',
                  sensitive ? (
                    e.emergencyContact ? (
                      `${e.emergencyContact.name} (${e.emergencyContact.relationship}) · ${e.emergencyContact.phone}`
                    ) : (
                      '—'
                    )
                  ) : (
                    <Hidden />
                  ),
                ],
              ]}
            />
            {manage && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => {
                  setContact(e.emergencyContact ?? { name: '', relationship: '', phone: '' })
                  setContactOpen(true)
                }}
              >
                Edit emergency contact
              </Button>
            )}
            {manage && e.status === 'terminated' && can('accounts.manage') && (
              <Button size="sm" variant="ghost" className="mt-4 ml-2" icon={Trash2} onClick={() => setErase(true)}>
                Erase personal data
              </Button>
            )}
          </Panel>
          {reports.length > 0 && (
            <Panel title={`Direct reports (${reports.length})`}>
              <ul className="divide-line divide-y">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Link to={`/people/${r.id}`} className="hover:bg-page flex items-center gap-3 px-4 py-2.5 text-sm">
                      <Avatar name={fullName(r)} size="xs" /> <span className="flex-1">{fullName(r)}</span>{' '}
                      <span className="text-muted text-xs">{r.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {details && cases.length > 0 && (
            <Panel title="Onboarding & offboarding">
              <ul className="divide-line divide-y">
                {cases.map((c) => (
                  <li key={c.id}>
                    <Link to={`/lifecycle/${c.id}`} className="hover:bg-page flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="flex-1 capitalize">{c.kind}</span>
                      <Badge tone={c.status === 'active' ? 'info' : c.status === 'completed' ? 'success' : 'neutral'}>{c.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      {tab === 'timeoff' && details && (
        <div className="space-y-5">
          <Panel
            title={`Balances ${year}`}
            actions={
              can('leave.manage') &&
              !isSelf && (
                <Button size="sm" onClick={() => setAdjust({ type: db.leaveTypes.find((t) => t.tracked)?.id ?? '', days: '', reason: '' })}>
                  Adjust balance
                </Button>
              )
            }
          >
            <ul className="divide-line grid divide-y sm:grid-cols-2 sm:divide-y-0">
              {db.leaveTypes
                .filter((t) => t.tracked && t.active)
                .map((t) => {
                  const b = leaveBalance(db, e.id, t.id, year)
                  return (
                    <li key={t.id} className="px-4 py-3 text-sm">
                      <p className="font-medium">{t.name}</p>
                      {b && (
                        <p className="text-muted text-xs">
                          <strong className="text-ink tabular text-base">{b.available}</strong> available · entitlement {b.entitlement}
                          {b.adjustments ? ` ${b.adjustments > 0 ? '+' : ''}${b.adjustments} adj.` : ''} · taken {b.taken} · pending {b.pending}
                        </p>
                      )}
                    </li>
                  )
                })}
            </ul>
          </Panel>
          <Panel title="Leave requests">
            {leaves.length ? (
              <ul className="divide-line divide-y">
                {leaves.map((l) => (
                  <li key={l.id}>
                    <Link to={`/leave/${l.id}`} className="hover:bg-page flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="flex-1">
                        {db.leaveTypes.find((t) => t.id === l.leaveTypeId)?.name} · {formatDate(l.startDate)} – {formatDate(l.endDate)} · {l.days} day(s)
                      </span>
                      <LeaveStatusBadge status={l.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No leave requests" compact />
            )}
          </Panel>
        </div>
      )}

      {tab === 'documents' && details && <DocumentsTab employee={e} manage={manage} />}
      {tab === 'equipment' && details && <EquipmentTab employee={e} manage={manage} />}
      {tab === 'requests' && details && (
        <Panel>
          {requests.length ? (
            <ul className="divide-line divide-y">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link to={`/requests/${r.id}`} className="hover:bg-page flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="text-muted tabular w-16 text-xs">{r.number}</span>
                    <span className="flex-1 truncate">{r.subject}</span>
                    <RequestStatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No requests you can see" compact />
          )}
        </Panel>
      )}
      {tab === 'history' && details && (
        <Panel title="Change history">
          <ol className="divide-line divide-y">
            {e.history.map((h) => (
              <li key={h.id} className="px-4 py-2.5 text-sm">
                <p>
                  <span className="font-medium">{h.field}</span>
                  {h.from !== null || h.to !== null ? (
                    <span className="text-ink-soft">
                      : {h.from ?? '—'} → {h.to ?? '—'}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted text-xs">
                  {formatDateTime(h.at)} · {h.by ? (db.accounts.find((a) => a.id === h.by)?.name ?? 'Unknown') : 'System'}
                  {h.note && ` · ${h.note}`}
                </p>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <EmployeeForm open={editing} onClose={() => setEditing(false)} employee={e} />
      <ConfirmDialog
        open={deactivating}
        onClose={() => setDeactivating(false)}
        title={`Record departure for ${fullName(e)}?`}
        description="A future last day marks the record as offboarding; a past or current date marks them as a former employee and suspends their sign-in. The record is kept — nothing is deleted."
        confirmLabel="Save"
        note={{ label: 'Reason', required: true, placeholder: 'e.g. Resignation' }}
        loading={deactivate.pending}
        onConfirm={async (reason) => {
          const r = await deactivate.run(reason)
          if (r.ok) setDeactivating(false)
        }}
      >
        <Field label="Last working day" required>
          {(a) => <Input {...a} type="date" value={endDate} onChange={(ev) => setEndDate(ev.target.value)} />}
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={erase}
        onClose={() => setErase(false)}
        title="Erase personal data?"
        description="Removes personal email, phone, date of birth and emergency contact under the retention policy. The work record and history are kept. This cannot be undone."
        tone="danger"
        confirmLabel="Erase"
        loading={eraseAction.pending}
        onConfirm={async () => {
          const r = await eraseAction.run()
          if (r.ok) setErase(false)
        }}
      />
      <Dialog
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        title="Emergency contact"
        size="sm"
        footer={
          <>
            <Button onClick={() => setContactOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={saveContact.pending}
              onClick={async () => {
                const r = await saveContact.run()
                if (r.ok) setContactOpen(false)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">{(a) => <Input {...a} value={contact.name} onChange={(ev) => setContact({ ...contact, name: ev.target.value })} />}</Field>
          <Field label="Relationship">
            {(a) => <Input {...a} value={contact.relationship} onChange={(ev) => setContact({ ...contact, relationship: ev.target.value })} />}
          </Field>
          <Field label="Phone">
            {(a) => <Input {...a} type="tel" value={contact.phone} onChange={(ev) => setContact({ ...contact, phone: ev.target.value })} />}
          </Field>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(adjust)}
        onClose={() => setAdjust(null)}
        title="Adjust leave balance"
        description="Adds or removes days for this year — e.g. carry-over or a correction. Recorded in the audit log."
        size="sm"
        footer={
          <>
            <Button onClick={() => setAdjust(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={adjustAction.pending}
              onClick={async () => {
                const r = await adjustAction.run()
                if (r.ok) setAdjust(null)
              }}
            >
              Save adjustment
            </Button>
          </>
        }
      >
        {adjust && (
          <div className="space-y-3">
            <Field label="Leave type">
              {(a) => (
                <Select
                  {...a}
                  value={adjust.type}
                  onChange={(ev) => setAdjust({ ...adjust, type: ev.target.value })}
                  options={db.leaveTypes.filter((t) => t.tracked).map((t) => ({ value: t.id, label: t.name }))}
                />
              )}
            </Field>
            <Field label="Days (+/-)" hint="Use a negative number to deduct.">
              {(a) => <Input {...a} type="number" step="0.5" value={adjust.days} onChange={(ev) => setAdjust({ ...adjust, days: ev.target.value })} />}
            </Field>
            <Field label="Reason" required>
              {(a) => <Input {...a} value={adjust.reason} onChange={(ev) => setAdjust({ ...adjust, reason: ev.target.value })} />}
            </Field>
          </div>
        )}
      </Dialog>
      {details && e.documents.length > 0 && tab === 'overview' && (
        <p className="text-muted mt-4 flex items-center gap-1 text-xs">
          <Download size={12} aria-hidden /> {e.documents.length} document(s) on file — see the Documents tab.
        </p>
      )}
    </div>
  )
}
