import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { MoreHorizontal, UserPlus, UserX, UserCheck, Search } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Avatar from '@/components/ui/Avatar'
import Dropdown from '@/components/ui/Dropdown'
import DataTable, { CellActions } from '@/components/ui/DataTable'
import StatusBadge from '@/components/ui/StatusBadge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SearchInput from '@/components/ui/SearchInput'
import MockNotice from '@/components/ui/MockNotice'
import EmptyState from '@/components/ui/EmptyState'
import { Field, Input, Select, FilterSelect } from '@/components/ui/FormControls'
import { useCollection, useLookups } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useOrgOptions } from '@/hooks/useJobs'
import { useSession } from '@/context/SessionContext'
import { settingsService } from '@/services/settingsService'
import { ROLES } from '@/utils/permissions'
import { rules } from '@/utils/validation'

function InviteModal({ open, onClose }) {
  const options = useOrgOptions()
  const invite = useAsyncAction(settingsService.inviteUser, { success: (u) => `${u.name} added as invited (demo — no email sent)` })
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm()
  useEffect(() => {
    if (open) reset({ name: '', email: '', title: '', role: 'Recruiter', departmentId: '' })
  }, [open, reset])

  const onSubmit = async (values) => {
    const res = await invite.run(values)
    if (res.ok) onClose()
    else if (/email/i.test(res.error?.message)) setError('email', { message: res.error.message })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite user"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="invite-form" loading={invite.pending}>
            Send invite
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Full name" required error={errors.name?.message}>
          {(a) => <Input {...a} {...register('name', rules.name('Name'))} invalid={!!errors.name} data-autofocus />}
        </Field>
        <Field label="Work email" required error={errors.email?.message}>
          {(a) => <Input {...a} type="email" {...register('email', rules.email)} invalid={!!errors.email} />}
        </Field>
        <Field label="Job title" optional>
          {(a) => <Input {...a} {...register('title')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" required>
            {(a) => <Select {...a} {...register('role')} options={ROLES.map((r) => ({ value: r, label: r }))} />}
          </Field>
          <Field label="Department" optional>
            {(a) => <Select {...a} {...register('departmentId')} options={options.departments} placeholder="All departments" />}
          </Field>
        </div>
        <MockNotice>Invitations are recorded locally. Account creation and email delivery require the authentication backend.</MockNotice>
      </form>
    </Modal>
  )
}

export default function UserManagement({ readOnly }) {
  const users = useCollection('users')
  const { departmentsById } = useLookups()
  const { user: me } = useSession()
  const update = useAsyncAction(settingsService.updateUser, { success: 'User updated' })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [deactivate, setDeactivate] = useState(null)
  const [q, setQ] = useState('')
  const [role, setRole] = useState('all')

  const rows = users.filter((u) => (role === 'all' || u.role === role) && (!q || `${u.name} ${u.email} ${u.title}`.toLowerCase().includes(q.toLowerCase())))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search users" label="Search users" className="flex-1" />
        <FilterSelect label="Role" value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r, label: r }))} className="sm:w-48" />
        <Button variant="primary" icon={UserPlus} onClick={() => setInviteOpen(true)} disabled={readOnly}>
          Invite user
        </Button>
      </div>
      <div className="rounded-2xl border border-line/80 bg-surface shadow-card">
        <DataTable
          rows={rows}
          empty={<EmptyState icon={Search} title="No users match" />}
          columns={[
            {
              key: 'name',
              header: 'User',
              render: (u) => (
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {u.name} {u.id === me.id && <span className="text-xs font-normal text-muted">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-muted">{u.email}</p>
                  </div>
                </div>
              ),
            },
            { key: 'title', header: 'Title', hideBelow: 'xl', render: (u) => <span className="text-ink-soft">{u.title || '—'}</span> },
            { key: 'dept', header: 'Department', hideBelow: 'lg', render: (u) => <span className="text-ink-soft">{departmentsById.get(u.departmentId)?.name ?? 'All departments'}</span> },
            {
              key: 'role',
              header: 'Role',
              render: (u) => (
                <Select
                  aria-label={`Role for ${u.name}`}
                  value={u.role}
                  disabled={readOnly || u.id === me.id}
                  onChange={(e) => update.run(u.id, { role: e.target.value })}
                  options={ROLES.map((r) => ({ value: r, label: r }))}
                  className="h-8! w-40 text-xs"
                />
              ),
            },
            { key: 'status', header: 'Status', hideBelow: 'md', render: (u) => <StatusBadge kind="user" value={u.status} /> },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              render: (u) => (
                <CellActions>
                  <Dropdown
                    menuLabel={`Actions for ${u.name}`}
                    items={
                      u.status === 'deactivated'
                        ? [{ label: 'Reactivate', icon: UserCheck, disabled: readOnly, onSelect: () => update.run(u.id, { status: 'active' }) }]
                        : [
                            ...(u.status === 'invited' ? [{ label: 'Mark invite accepted (demo)', icon: UserCheck, disabled: readOnly, onSelect: () => update.run(u.id, { status: 'active' }) }] : []),
                            { label: 'Deactivate', icon: UserX, danger: true, disabled: readOnly || u.id === me.id, disabledReason: u.id === me.id ? "You can't deactivate yourself" : undefined, onSelect: () => setDeactivate(u) },
                          ]
                    }
                    renderTrigger={(props) => <Button {...props} size="sm" variant="ghost" iconOnly icon={MoreHorizontal} aria-label={`Actions for ${u.name}`} />}
                  />
                </CellActions>
              ),
            },
          ]}
          mobileCard={(u) => (
            <div className="flex items-center gap-3">
              <Avatar name={u.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-xs text-muted">
                  {u.role} · {u.email}
                </p>
              </div>
              <StatusBadge kind="user" value={u.status} />
            </div>
          )}
        />
      </div>
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <ConfirmDialog
        open={Boolean(deactivate)}
        onClose={() => setDeactivate(null)}
        title={`Deactivate ${deactivate?.name}?`}
        description="They lose access immediately. Their interview history and notes are kept. You can reactivate them later."
        confirmLabel="Deactivate"
        tone="danger"
        loading={update.pending}
        onConfirm={async () => {
          const res = await update.run(deactivate.id, { status: 'deactivated' })
          if (res.ok) setDeactivate(null)
        }}
      />
    </div>
  )
}
