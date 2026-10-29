import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Info } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { leaveBalance, validateLeave } from '@/domain/leave'
import type { LeaveRequest } from '@/domain/types'
import { addDays, parseISODate, today } from '@/lib/dates'
import { fullName } from '@/lib/utils'
import { requestLeave } from '@/services/leave'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/Form'
import { PageHeader, Panel } from '@/components/ui/Layout'

export default function NewLeavePage() {
  const db = useDb()
  const { account, can } = useSession()
  const navigate = useNavigate()
  const types = db.leaveTypes.filter((t) => t.active)
  const [form, setForm] = useState({
    employeeId: account.employeeId ?? '',
    leaveTypeId: types[0]?.id ?? '',
    startDate: addDays(today(), 7),
    endDate: addDays(today(), 7),
    halfDayStart: false,
    halfDayEnd: false,
    reason: '',
  })
  const [touched, setTouched] = useState(false)
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p, ...(p.startDate && p.startDate > f.endDate ? { endDate: p.startDate } : {}) }))
  const check = useMemo(
    () => (form.employeeId ? validateLeave(db, form) : { days: 0, errors: ['Your account has no employee record.'], warnings: [] }),
    [db, form],
  )
  const type = types.find((t) => t.id === form.leaveTypeId)
  const year = form.startDate ? parseISODate(form.startDate).getFullYear() : new Date().getFullYear()
  const bal = type?.tracked && form.employeeId ? leaveBalance(db, form.employeeId, type.id, year) : null
  const submit = useAction(
    () => requestLeave(account, form),
    (l: LeaveRequest) => (l.status === 'approved' ? 'Leave recorded' : 'Leave requested — your approver has been notified'),
  )

  return (
    <div className="max-w-3xl">
      <Link to="/leave" className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={14} aria-hidden /> Leave
      </Link>
      <PageHeader title="Request leave" description="Days are counted from the working pattern and holidays for your location." />
      <Panel>
        <form
          noValidate
          className="grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setTouched(true)
            if (check.errors.length) return
            const r = await submit.run()
            if (r.ok) navigate(`/leave/${r.value.id}`)
          }}
        >
          {can('leave.manage') && (
            <Field label="Employee" className="sm:col-span-2" hint="HR can record leave on behalf of an employee.">
              {(a) => (
                <Select
                  {...a}
                  value={form.employeeId}
                  onChange={(e) => set({ employeeId: e.target.value })}
                  options={db.employees
                    .filter((e) => e.status !== 'terminated')
                    .map((e) => ({ value: e.id, label: `${fullName(e)}${e.id === account.employeeId ? ' (me)' : ''}` }))}
                />
              )}
            </Field>
          )}
          <Field label="Leave type" required className="sm:col-span-2">
            {(a) => (
              <Select
                {...a}
                value={form.leaveTypeId}
                onChange={(e) => set({ leaveTypeId: e.target.value })}
                options={types.map((t) => ({ value: t.id, label: t.name }))}
              />
            )}
          </Field>
          <Field label="First day" required>
            {(a) => <Input {...a} type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />}
          </Field>
          <Field label="Last day" required>
            {(a) => <Input {...a} type="date" min={form.startDate} value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />}
          </Field>
          <Checkbox label="Half day on the first day" checked={form.halfDayStart} onChange={(e) => set({ halfDayStart: e.target.checked })} />
          <Checkbox label="Half day on the last day" checked={form.halfDayEnd} onChange={(e) => set({ halfDayEnd: e.target.checked })} />
          <Field label="Reason" hint="Optional — visible to your approvers." className="sm:col-span-2">
            {(a) => <Textarea {...a} rows={3} value={form.reason} onChange={(e) => set({ reason: e.target.value })} />}
          </Field>

          <div className="bg-page border-line space-y-1 rounded-md border px-4 py-3 text-sm sm:col-span-2" aria-live="polite">
            <p>
              <strong className="tabular">{check.days}</strong> working day{check.days === 1 ? '' : 's'}
              {bal && (
                <span className="text-muted">
                  {' '}
                  · {bal.available} available in {year} →{' '}
                  <strong className={bal.available - check.days < 0 ? 'text-danger' : 'text-ink'}>{bal.available - check.days}</strong> after this request
                </span>
              )}
              {type && !type.tracked && <span className="text-muted"> · not deducted from a balance</span>}
            </p>
            {type && (
              <p className="text-muted flex items-center gap-1.5 text-xs">
                <Info size={13} aria-hidden />{' '}
                {type.approvalChain.length
                  ? `Approval: ${type.approvalChain.map((s) => s.name.toLowerCase()).join(', then ')}.`
                  : 'Recorded without approval (configured for this leave type).'}
              </p>
            )}
            {check.warnings.map((w) => (
              <p key={w} className="text-warning flex items-center gap-1.5 text-xs">
                <AlertTriangle size={13} aria-hidden /> {w}
              </p>
            ))}
          </div>
          <div className="sm:col-span-2">
            <FormError message={touched ? (check.errors[0] ?? null) : null} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button onClick={() => navigate('/leave')}>Cancel</Button>
            <Button type="submit" variant="primary" loading={submit.pending}>
              Submit request
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  )
}
