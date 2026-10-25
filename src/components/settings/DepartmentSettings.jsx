import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, Input, Select } from '@/components/ui/FormControls'
import { useCollection, useLookups } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { settingsService } from '@/services/settingsService'
import { rules } from '@/utils/validation'

const SWATCHES = ['#592ca2', '#0ea5e9', '#14b8a6', '#f59e0b', '#6366f1', '#64748b', '#e11d48']

export default function DepartmentSettings({ readOnly }) {
  const departments = useCollection('departments')
  const jobs = useCollection('jobs')
  const users = useCollection('users')
  const { usersById } = useLookups()
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const save = useAsyncAction(settingsService.saveDepartment, { success: 'Department saved' })
  const remove = useAsyncAction(settingsService.deleteDepartment, { success: 'Department deleted' })
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm()

  useEffect(() => {
    if (editing) reset({ name: '', code: '', headId: '', color: SWATCHES[0], ...editing })
  }, [editing, reset])

  const stats = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, { open: jobs.filter((j) => j.departmentId === d.id && j.status === 'open').length, total: jobs.filter((j) => j.departmentId === d.id).length }])), [departments, jobs])

  const onSubmit = async (values) => {
    const res = await save.run({ ...editing, ...values, code: values.code.toUpperCase() })
    if (res.ok) setEditing(null)
  }
  const color = watch('color')

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" icon={Plus} onClick={() => setEditing({})} disabled={readOnly}>
          Add department
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {departments.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {d.name} <span className="text-xs font-normal text-faint">{d.code}</span>
              </p>
              <p className="text-xs text-muted">
                Head: {usersById.get(d.headId)?.name ?? 'Unassigned'} · {stats[d.id]?.open ?? 0} open of {stats[d.id]?.total ?? 0} vacancies
              </p>
            </div>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(d)} disabled={readOnly}>
              Edit
            </Button>
            <Button size="sm" variant="danger-ghost" iconOnly icon={Trash2} aria-label={`Delete ${d.name}`} onClick={() => setDeleting(d)} disabled={readOnly} />
          </li>
        ))}
      </ul>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="sm"
        title={editing?.id ? 'Edit department' : 'Add department'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="dept-form" loading={save.pending}>
              Save
            </Button>
          </>
        }
      >
        <form id="dept-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Field label="Name" required error={errors.name?.message}>
            {(a) => <Input {...a} {...register('name', rules.name('Name'))} invalid={!!errors.name} data-autofocus />}
          </Field>
          <Field label="Short code" required error={errors.code?.message} hint="2–4 letters, used in charts">
            {(a) => <Input {...a} maxLength={4} {...register('code', { required: 'Code is required', pattern: { value: /^[A-Za-z]{2,4}$/, message: 'Use 2–4 letters' } })} invalid={!!errors.code} />}
          </Field>
          <Field label="Department head">{(a) => <Select {...a} {...register('headId')} options={users.filter((u) => u.status === 'active').map((u) => ({ value: u.id, label: u.name }))} placeholder="Unassigned" />}</Field>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-ink-soft">Colour</legend>
            <div className="flex gap-2">
              {SWATCHES.map((s) => (
                <button key={s} type="button" onClick={() => setValue('color', s)} className={`h-7 w-7 rounded-md ring-offset-2 ${color === s ? 'ring-2 ring-brand-600' : ''}`} style={{ background: s }} aria-label={`Colour ${s}`} aria-pressed={color === s} />
              ))}
            </div>
          </fieldset>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Departments with vacancies can't be deleted. This can't be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={remove.pending}
        onConfirm={async () => {
          const res = await remove.run(deleting.id)
          if (res.ok) setDeleting(null)
        }}
      />
    </div>
  )
}
