import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { today } from '@/lib/dates'
import { fullName } from '@/lib/utils'
import type { Employee } from '@/domain/types'
import { createEmployee, findDuplicates, updateEmployee, validateEmployee, type EmployeeInput } from '@/services/employees'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Form'
import { Drawer } from '@/components/ui/Overlay'

const blank = (db: ReturnType<typeof useDb>): EmployeeInput => ({
  firstName: '',
  lastName: '',
  preferredName: '',
  workEmail: '',
  personalEmail: '',
  phone: '',
  title: '',
  departmentId: '',
  teamId: '',
  managerId: '',
  employmentTypeId: db.employmentTypes[0]?.id ?? '',
  locationId: '',
  scheduleId: db.schedules[0]?.id ?? '',
  joinDate: today(),
  dateOfBirth: '',
  employeeNo: '',
})

export function EmployeeForm({ open, onClose, employee }: { open: boolean; onClose: () => void; employee?: Employee | null }) {
  const db = useDb()
  const { account } = useSession()
  const navigate = useNavigate()
  const [values, setValues] = useState<EmployeeInput>(() => blank(db))
  const [submitted, setSubmitted] = useState(false)
  const [allowDuplicate, setAllowDuplicate] = useState(false)

  useEffect(() => {
    if (!open) return
    setSubmitted(false)
    setAllowDuplicate(false)
    setValues(
      employee
        ? {
            ...employee,
            preferredName: employee.preferredName ?? '',
            personalEmail: employee.personalEmail ?? '',
            phone: employee.phone ?? '',
            teamId: employee.teamId ?? '',
            managerId: employee.managerId ?? '',
            dateOfBirth: employee.dateOfBirth ?? '',
          }
        : blank(db),
    )
    // Reset only when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee])

  const errors = useMemo(() => validateEmployee(db, values, employee?.id), [db, values, employee])
  const dups = useMemo(() => (employee ? [] : findDuplicates(values, db.employees)), [db, values, employee])
  const save = useAction(
    () => (employee ? updateEmployee(account, employee.id, values) : createEmployee(account, values, { allowDuplicate })),
    employee ? 'Employee record updated' : 'Employee created',
  )
  const set = (patch: Partial<EmployeeInput>) => setValues((v) => ({ ...v, ...patch }))
  const err = (k: keyof EmployeeInput) => (submitted ? errors[k] : undefined)

  const submit = async () => {
    setSubmitted(true)
    if (Object.keys(errors).length) return
    if (dups.length && !allowDuplicate) return
    const res = await save.run()
    if (res.ok) {
      onClose()
      if (!employee && res.value) navigate(`/people/${(res.value as Employee).id}`)
    }
  }

  const managers = db.employees.filter((e) => e.status !== 'terminated' && e.id !== employee?.id).sort((a, b) => a.firstName.localeCompare(b.firstName))
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={employee ? `Edit ${fullName(employee)}` : 'Add employee'}
      description={
        employee
          ? 'Changes are recorded in the employee’s history.'
          : 'Future joining dates create a pre-boarding record; onboarding starts automatically if an automation rule is enabled.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.pending} onClick={submit}>
            {employee ? 'Save changes' : 'Create employee'}
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {dups.length > 0 && (
          <div role="alert" className="bg-warning-soft text-warning rounded-md px-3 py-2.5 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle size={15} aria-hidden /> Possible duplicate
            </p>
            <ul className="mt-1 list-disc pl-5">
              {dups.map((d) => (
                <li key={d.employee.id}>
                  {fullName(d.employee)} ({d.employee.employeeNo}) — {d.reasons.join(', ')}
                </li>
              ))}
            </ul>
            <label className="text-ink mt-2 flex items-center gap-2">
              <input type="checkbox" className="accent-brand-600" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} /> This is a
              different person — create anyway
            </label>
          </div>
        )}
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">Personal</legend>
          <Field label="First name" required error={err('firstName')}>
            {(a) => <Input {...a} value={values.firstName} onChange={(e) => set({ firstName: e.target.value })} data-autofocus />}
          </Field>
          <Field label="Last name" required error={err('lastName')}>
            {(a) => <Input {...a} value={values.lastName} onChange={(e) => set({ lastName: e.target.value })} />}
          </Field>
          <Field label="Preferred name" hint="Shown instead of the first name.">
            {(a) => <Input {...a} value={values.preferredName ?? ''} onChange={(e) => set({ preferredName: e.target.value })} />}
          </Field>
          <Field label="Date of birth" error={err('dateOfBirth')} hint="Visible to HR and the employee only.">
            {(a) => <Input {...a} type="date" value={values.dateOfBirth ?? ''} onChange={(e) => set({ dateOfBirth: e.target.value })} />}
          </Field>
          <Field label="Personal email" error={err('personalEmail')}>
            {(a) => <Input {...a} type="email" value={values.personalEmail ?? ''} onChange={(e) => set({ personalEmail: e.target.value })} />}
          </Field>
          <Field label="Phone" error={err('phone')}>
            {(a) => <Input {...a} type="tel" value={values.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />}
          </Field>
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">Employment</legend>
          <Field label="Work email" required error={err('workEmail')}>
            {(a) => <Input {...a} type="email" value={values.workEmail} onChange={(e) => set({ workEmail: e.target.value })} />}
          </Field>
          <Field label="Employee ID" error={err('employeeNo')} hint={employee ? undefined : 'Leave empty to assign the next number.'}>
            {(a) => <Input {...a} value={values.employeeNo ?? ''} onChange={(e) => set({ employeeNo: e.target.value })} />}
          </Field>
          <Field label="Job title" required error={err('title')} className="sm:col-span-2">
            {(a) => <Input {...a} value={values.title} onChange={(e) => set({ title: e.target.value })} />}
          </Field>
          <Field label="Department" required error={err('departmentId')}>
            {(a) => (
              <Select
                {...a}
                value={values.departmentId}
                onChange={(e) => set({ departmentId: e.target.value, teamId: '' })}
                placeholder="Select…"
                options={db.departments.map((d) => ({ value: d.id, label: d.name }))}
              />
            )}
          </Field>
          <Field label="Team" error={err('teamId')}>
            {(a) => (
              <Select
                {...a}
                value={values.teamId ?? ''}
                onChange={(e) => set({ teamId: e.target.value })}
                placeholder="No team"
                options={db.teams.filter((t) => t.departmentId === values.departmentId).map((t) => ({ value: t.id, label: t.name }))}
              />
            )}
          </Field>
          <Field label="Manager" error={err('managerId')}>
            {(a) => (
              <Select
                {...a}
                value={values.managerId ?? ''}
                onChange={(e) => set({ managerId: e.target.value })}
                placeholder="No manager"
                options={managers.map((m) => ({ value: m.id, label: `${fullName(m)} — ${m.title}` }))}
              />
            )}
          </Field>
          <Field label="Location" required error={err('locationId')}>
            {(a) => (
              <Select
                {...a}
                value={values.locationId}
                onChange={(e) => set({ locationId: e.target.value })}
                placeholder="Select…"
                options={db.locations.map((l) => ({ value: l.id, label: l.name }))}
              />
            )}
          </Field>
          <Field label="Employment type" required error={err('employmentTypeId')}>
            {(a) => (
              <Select
                {...a}
                value={values.employmentTypeId}
                onChange={(e) => set({ employmentTypeId: e.target.value })}
                options={db.employmentTypes.map((t) => ({ value: t.id, label: t.name }))}
              />
            )}
          </Field>
          <Field label="Work schedule" required error={err('scheduleId')} hint="Used to count leave days.">
            {(a) => (
              <Select
                {...a}
                value={values.scheduleId}
                onChange={(e) => set({ scheduleId: e.target.value })}
                options={db.schedules.map((s) => ({ value: s.id, label: s.name }))}
              />
            )}
          </Field>
          <Field label="Joining date" required error={err('joinDate')}>
            {(a) => <Input {...a} type="date" value={values.joinDate} onChange={(e) => set({ joinDate: e.target.value })} />}
          </Field>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}
