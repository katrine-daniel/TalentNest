import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, X } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { canDecide } from '@/domain/approvals'
import { canViewLeave } from '@/domain/permissions'
import { formatDate, formatDateTime, today } from '@/lib/dates'
import { cancelLeave, decideLeave, delegateLeave, resubmitLeave } from '@/services/leave'
import { Button, LinkButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { EmptyState, KeyValue, Panel } from '@/components/ui/Layout'
import { LeaveStatusBadge, PersonCell } from '@/features/shared/display'
import { ApprovalTrail } from '@/features/requests/ApprovalTrail'

export default function LeaveDetailPage() {
  const { leaveId } = useParams()
  const db = useDb()
  const { account, can } = useSession()
  const l = db.leaveRequests.find((x) => x.id === leaveId)
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'changes_requested' | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [edit, setEdit] = useState<{ startDate: string; endDate: string; reason: string } | null>(null)
  const [delegateTo, setDelegateTo] = useState('')
  const decide = useAction(
    (d: 'approved' | 'rejected' | 'changes_requested', note: string) => decideLeave(account, leaveId as string, d, note),
    'Decision recorded',
  )
  const cancel = useAction((note: string) => cancelLeave(account, leaveId as string, note), 'Leave cancelled')
  const resubmit = useAction(
    () =>
      resubmitLeave(account, leaveId as string, {
        leaveTypeId: l?.leaveTypeId as string,
        startDate: edit?.startDate as string,
        endDate: edit?.endDate as string,
        halfDayStart: l?.halfDayStart ?? false,
        halfDayEnd: l?.halfDayEnd ?? false,
        reason: edit?.reason ?? '',
      }),
    'Resubmitted for approval',
  )
  const delegate = useAction((to: string) => delegateLeave(account, leaveId as string, to), 'Approval delegated')

  if (!l || !canViewLeave(account, l, db)) return <EmptyState title="Leave request not found" action={<LinkButton to="/leave">Back to leave</LinkButton>} />
  const employee = db.employees.find((e) => e.id === l.employeeId)
  const type = db.leaveTypes.find((t) => t.id === l.leaveTypeId)
  const own = l.employeeId === account.employeeId
  const mayDecide = l.status === 'pending' && canDecide(l.approvals, account.id)
  const mayCancel =
    (own || can('leave.manage')) && !['cancelled', 'rejected'].includes(l.status) && (l.status !== 'approved' || l.startDate > today() || can('leave.manage'))
  const name = (id: string | null) => (id ? (db.accounts.find((a) => a.id === id)?.name ?? 'Unknown') : 'System')
  const delegates = db.accounts.filter((a) => a.status === 'active' && a.id !== account.id && a.employeeId !== l.employeeId && a.role !== 'employee')

  return (
    <div className="max-w-5xl">
      <Link to="/leave" className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={14} aria-hidden /> Leave
      </Link>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-muted text-sm">{type?.name}</p>
          <h1 className="text-xl font-semibold tracking-tight">
            {formatDate(l.startDate)} – {formatDate(l.endDate)} · {l.days} day{l.days === 1 ? '' : 's'}
          </h1>
          <div className="mt-2">
            <LeaveStatusBadge status={l.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {mayDecide && (
            <>
              <Button variant="primary" icon={Check} onClick={() => setDecision('approved')}>
                Approve
              </Button>
              <Button onClick={() => setDecision('changes_requested')}>Request changes</Button>
              <Button variant="ghost" icon={X} onClick={() => setDecision('rejected')}>
                Decline
              </Button>
            </>
          )}
          {l.status === 'changes_requested' && (own || l.requestedBy === account.id) && (
            <Button variant="primary" onClick={() => setEdit({ startDate: l.startDate, endDate: l.endDate, reason: l.reason })}>
              Edit and resubmit
            </Button>
          )}
          {mayCancel && (
            <Button variant="ghost" onClick={() => setCancelling(true)}>
              Cancel leave
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Request" bodyClassName="p-4">
          <KeyValue
            className="sm:grid-cols-1"
            items={[
              ['Employee', <PersonCell key="p" employee={employee} />],
              ['Half days', [l.halfDayStart && 'first day', l.halfDayEnd && 'last day'].filter(Boolean).join(', ') || 'None'],
              ['Reason', l.reason || '—'],
              ['Requested', `${formatDateTime(l.createdAt)} by ${name(l.requestedBy)}`],
            ]}
          />
        </Panel>
        <Panel title="Approvals">
          <ApprovalTrail steps={l.approvals} accounts={db.accounts} />
          {mayDecide && delegates.length > 0 && (
            <div className="border-line flex items-end gap-2 border-t px-4 py-3">
              <Field label="Delegate this step" className="flex-1">
                {(a) => (
                  <Select
                    {...a}
                    value={delegateTo}
                    onChange={(e) => setDelegateTo(e.target.value)}
                    placeholder="Choose a person"
                    options={delegates.map((d) => ({ value: d.id, label: d.name }))}
                  />
                )}
              </Field>
              <Button disabled={!delegateTo} loading={delegate.pending} onClick={() => delegate.run(delegateTo)}>
                Delegate
              </Button>
            </div>
          )}
        </Panel>
        <Panel title="History" className="lg:col-span-2">
          <ol className="divide-line divide-y">
            {l.timeline.map((t) => (
              <li key={t.id} className="px-4 py-2.5 text-sm">
                {t.text}{' '}
                <span className="text-muted text-xs">
                  · {name(t.by)} · {formatDateTime(t.at)}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
      <ConfirmDialog
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision === 'approved' ? 'Approve leave' : decision === 'rejected' ? 'Decline leave' : 'Request changes'}
        description="Balance and overlaps are re-checked when you approve."
        confirmLabel={decision === 'approved' ? 'Approve' : decision === 'rejected' ? 'Decline' : 'Request changes'}
        tone={decision === 'rejected' ? 'danger' : 'primary'}
        note={{ label: 'Comment', required: decision !== 'approved' }}
        loading={decide.pending}
        onConfirm={async (note) => {
          if (!decision) return
          const r = await decide.run(decision, note)
          if (r.ok) setDecision(null)
        }}
      />
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel this leave?"
        description={l.status === 'approved' ? 'The days return to the balance and your approver is notified.' : 'The request is withdrawn.'}
        confirmLabel="Cancel leave"
        tone="danger"
        note={{ label: 'Reason', placeholder: 'Optional' }}
        loading={cancel.pending}
        onConfirm={async (note) => {
          const r = await cancel.run(note)
          if (r.ok) setCancelling(false)
        }}
      />
      <ConfirmDialog
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title="Edit and resubmit"
        confirmLabel="Resubmit"
        loading={resubmit.pending}
        onConfirm={async () => {
          const r = await resubmit.run()
          if (r.ok) setEdit(null)
        }}
      >
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First day">
              {(a) => <Input {...a} type="date" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} />}
            </Field>
            <Field label="Last day">
              {(a) => <Input {...a} type="date" value={edit.endDate} onChange={(e) => setEdit({ ...edit, endDate: e.target.value })} />}
            </Field>
            <Field label="Reason" className="sm:col-span-2">
              {(a) => <Textarea {...a} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />}
            </Field>
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
