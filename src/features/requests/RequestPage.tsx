import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Lock, Paperclip, Send, UserRoundPlus, X } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { canDecide, hrHandlers } from '@/domain/approvals'
import { canViewRequest, isHR } from '@/domain/permissions'
import { isOpenRequest, isOverdue } from '@/domain/sla'
import type { RequestStatus } from '@/domain/types'
import { formatDateTime, formatRelative } from '@/lib/dates'
import { cn, fullName } from '@/lib/utils'
import {
  addComment,
  allowedTransitions,
  assignRequest,
  changeStatus,
  decideRequest,
  delegateApproval,
  openAttachment,
  resubmitRequest,
  STATUS_LABELS,
  UPDATABLE_FIELDS,
  visibleRequests,
} from '@/services/requests'
import { Badge } from '@/components/ui/Badge'
import { Button, LinkButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field, Select, Textarea } from '@/components/ui/Form'
import { Avatar, EmptyState, KeyValue, Panel } from '@/components/ui/Layout'
import { useToast } from '@/components/ui/Toast'
import { CATEGORY_LABELS, DueLabel, PersonCell, PriorityBadge, RequestStatusBadge } from '@/features/shared/display'
import { ApprovalTrail } from './ApprovalTrail'

export default function RequestPage() {
  const { requestId } = useParams()
  const db = useDb()
  const { account } = useSession()
  const toast = useToast()
  const hr = isHR(account)
  const raw = db.requests.find((r) => r.id === requestId)
  const r = raw && canViewRequest(account, raw, db) ? visibleRequests(db, account).find((x) => x.id === requestId) : undefined
  const [comment, setComment] = useState('')
  const [internal, setInternal] = useState(false)
  const [transition, setTransition] = useState<RequestStatus | null>(null)
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'changes_requested' | null>(null)
  const [resubmitText, setResubmitText] = useState<string | null>(null)
  const [delegateTo, setDelegateTo] = useState('')

  const send = useAction(() => addComment(account, requestId as string, comment, internal), internal ? 'Internal note added' : 'Reply sent')
  const assign = useAction((id: string | null) => assignRequest(account, requestId as string, id), 'Owner updated')
  const status = useAction((s: RequestStatus, note: string) => changeStatus(account, requestId as string, s, note), 'Status updated')
  const decide = useAction(
    (d: 'approved' | 'rejected' | 'changes_requested', note: string) => decideRequest(account, requestId as string, d, note),
    'Decision recorded',
  )
  const resubmit = useAction((text: string) => resubmitRequest(account, requestId as string, text), 'Request resubmitted')
  const delegate = useAction((to: string) => delegateApproval(account, requestId as string, to), 'Approval delegated')

  if (!r)
    return (
      <EmptyState
        title="Request not found"
        description="It may have been removed, or you don’t have access to it."
        action={<LinkButton to="/requests">Back to requests</LinkButton>}
      />
    )

  const type = db.requestTypes.find((t) => t.id === r.typeId)
  const employee = db.employees.find((e) => e.id === r.employeeId)
  const accountName = (id: string | null) => (id ? (db.accounts.find((a) => a.id === id)?.name ?? 'Unknown') : 'System')
  const mayDecide = r.status === 'pending_approval' && canDecide(r.approvals, account.id)
  const transitions = allowedTransitions(r, account)
  const activity = [
    ...r.comments.map((c) => ({ kind: 'comment' as const, at: c.at, c })),
    ...r.timeline.map((t) => ({ kind: 'event' as const, at: t.at, t })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  const delegates = db.accounts.filter(
    (a) => a.status === 'active' && a.id !== account.id && a.id !== r.requesterId && a.employeeId !== r.employeeId && a.role !== 'employee',
  )

  return (
    <div>
      <Link to="/requests" className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={14} aria-hidden /> Requests
      </Link>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-muted text-sm">
            {r.number} · {type?.name} · {CATEGORY_LABELS[r.category]}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{r.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={r.status} />
            <PriorityBadge priority={r.priority} />
            {isOverdue(r) && <Badge tone="danger">Past service target</Badge>}
            {r.escalatedAt && <Badge tone="warning">Escalated {formatRelative(r.escalatedAt)}</Badge>}
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
                Reject
              </Button>
            </>
          )}
          {r.status === 'changes_requested' && r.requesterId === account.id && (
            <Button variant="primary" onClick={() => setResubmitText(r.description)}>
              Update and resubmit
            </Button>
          )}
          {hr && isOpenRequest(r) && r.assigneeId !== account.id && r.status !== 'pending_approval' && (
            <Button icon={UserRoundPlus} loading={assign.pending} onClick={() => assign.run(account.id)}>
              Assign to me
            </Button>
          )}
          {transitions.map((s) => (
            <Button key={s} variant={s === 'resolved' ? 'primary' : s === 'cancelled' ? 'ghost' : 'secondary'} onClick={() => setTransition(s)}>
              {s === 'resolved'
                ? 'Resolve'
                : s === 'cancelled'
                  ? 'Cancel request'
                  : s === 'closed'
                    ? 'Close'
                    : s === 'in_progress' && r.status === 'resolved'
                      ? 'Reopen'
                      : s === 'waiting_on_employee'
                        ? 'Ask employee'
                        : STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Panel title="Request" bodyClassName="p-4">
            <p className="text-ink-soft text-sm whitespace-pre-line">{r.description || <span className="text-muted">No description.</span>}</p>
            {r.proposedChanges && (
              <div className="mt-4">
                <p className="text-muted mb-1 text-xs font-medium">Proposed changes</p>
                <dl className="bg-page border-line grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-sm">
                  {Object.entries(r.proposedChanges).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{UPDATABLE_FIELDS[k] ?? k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {r.attachments.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {r.attachments.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="border-line hover:bg-page inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs"
                      onClick={async () => {
                        try {
                          window.open(await openAttachment(account, r.id, a.id), '_blank', 'noopener')
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Could not open file')
                        }
                      }}
                    >
                      <Paperclip size={12} aria-hidden /> {a.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {r.resolution && (
              <div className="bg-success-soft mt-4 rounded-md px-3 py-2 text-sm">
                <p className="text-success text-xs font-medium">Resolution</p>
                <p>{r.resolution}</p>
              </div>
            )}
          </Panel>

          <Panel title="Conversation & activity">
            <ol className="space-y-4 px-4 py-4">
              {activity.map((item) =>
                item.kind === 'comment' ? (
                  <li key={item.c.id} className={cn('flex gap-3', item.c.internal && 'bg-warning-soft/60 -mx-2 rounded-md px-2 py-2')}>
                    <Avatar name={accountName(item.c.authorId)} size="sm" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p>
                        <span className="font-medium">{accountName(item.c.authorId)}</span>{' '}
                        <span className="text-muted text-xs">{formatDateTime(item.c.at)}</span>
                        {item.c.internal && (
                          <span className="text-warning ml-2 inline-flex items-center gap-1 text-xs font-medium">
                            <Lock size={11} aria-hidden /> Internal note — HR only
                          </span>
                        )}
                      </p>
                      <p className="text-ink-soft mt-0.5 whitespace-pre-line">{item.c.text}</p>
                    </div>
                  </li>
                ) : (
                  <li key={item.t.id} className="text-muted flex gap-3 pl-1 text-xs">
                    <span className="bg-line-strong mt-1.5 size-1.5 shrink-0 rounded-full" aria-hidden />
                    <span>
                      {item.t.text} · {accountName(item.t.by)} · {formatDateTime(item.t.at)}
                    </span>
                  </li>
                ),
              )}
            </ol>
            {!['closed', 'cancelled'].includes(r.status) && (
              <form
                className="border-line space-y-2 border-t p-4"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const res = await send.run()
                  if (res.ok) setComment('')
                }}
              >
                <Field label={internal ? 'Internal note (HR only)' : 'Reply'}>
                  {(a) => (
                    <Textarea {...a} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className={internal ? 'bg-warning-soft/40' : ''} />
                  )}
                </Field>
                <div className="flex items-center justify-between gap-2">
                  {hr ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="accent-brand-600" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note
                    </label>
                  ) : (
                    <span />
                  )}
                  <Button type="submit" variant="primary" icon={Send} disabled={!comment.trim()} loading={send.pending}>
                    {internal ? 'Add note' : 'Send'}
                  </Button>
                </div>
              </form>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Details" bodyClassName="p-4">
            <KeyValue
              className="sm:grid-cols-1"
              items={[
                ['Employee', <PersonCell key="e" employee={employee} />],
                ['Raised by', `${accountName(r.requesterId)} · ${formatDateTime(r.createdAt)}`],
                ['Service target', <DueLabel key="d" due={r.dueAt} done={!isOpenRequest(r)} />],
                [
                  'Owner',
                  hr && isOpenRequest(r) ? (
                    <Select
                      key="o"
                      aria-label="Owner"
                      value={r.assigneeId ?? ''}
                      onChange={(e) => assign.run(e.target.value || null)}
                      placeholder="Unassigned"
                      options={hrHandlers(db).map((a) => ({ value: a.id, label: a.name }))}
                    />
                  ) : (
                    accountName(r.assigneeId)
                  ),
                ],
              ]}
            />
          </Panel>
          <Panel title="Approvals">
            <ApprovalTrail steps={r.approvals} accounts={db.accounts} />
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
          {employee && hr && (
            <p className="text-muted px-1 text-xs">
              Need context?{' '}
              <Link className="text-brand-700 hover:underline" to={`/people/${employee.id}`}>
                Open {fullName(employee)}’s profile
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(transition)}
        onClose={() => setTransition(null)}
        title={
          transition === 'resolved'
            ? 'Resolve request'
            : transition === 'waiting_on_employee'
              ? 'Ask the employee for information'
              : transition === 'cancelled'
                ? 'Cancel this request?'
                : `Move to ${transition ? STATUS_LABELS[transition].toLowerCase() : ''}?`
        }
        confirmLabel={
          transition === 'resolved' ? 'Resolve' : transition === 'waiting_on_employee' ? 'Send' : transition === 'cancelled' ? 'Cancel request' : 'Confirm'
        }
        tone={transition === 'cancelled' ? 'danger' : 'primary'}
        note={
          transition === 'resolved'
            ? { label: 'Resolution note', required: !r.resolution, placeholder: 'What was done — shared with the employee' }
            : transition === 'waiting_on_employee'
              ? { label: 'Message to the employee', required: true }
              : { label: 'Note', placeholder: 'Optional' }
        }
        loading={status.pending}
        onConfirm={async (note) => {
          if (!transition) return
          const res = await status.run(transition, note)
          if (res.ok) setTransition(null)
        }}
      />
      <ConfirmDialog
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision === 'approved' ? 'Approve request' : decision === 'rejected' ? 'Reject request' : 'Request changes'}
        description={
          r.proposedChanges && decision === 'approved'
            ? 'Approving applies the proposed changes to the employee record.'
            : 'The requester is notified of your decision.'
        }
        confirmLabel={decision === 'approved' ? 'Approve' : decision === 'rejected' ? 'Reject' : 'Request changes'}
        tone={decision === 'rejected' ? 'danger' : 'primary'}
        note={{ label: 'Comment', required: decision !== 'approved' }}
        loading={decide.pending}
        onConfirm={async (note) => {
          if (!decision) return
          const res = await decide.run(decision, note)
          if (res.ok) setDecision(null)
        }}
      />
      <ConfirmDialog
        open={resubmitText !== null}
        onClose={() => setResubmitText(null)}
        title="Update and resubmit"
        description="Your approvers will review the request again from the first step."
        confirmLabel="Resubmit"
        loading={resubmit.pending}
        onConfirm={async () => {
          const res = await resubmit.run(resubmitText ?? '')
          if (res.ok) setResubmitText(null)
        }}
      >
        <Field label="Description">{(a) => <Textarea {...a} rows={5} value={resubmitText ?? ''} onChange={(e) => setResubmitText(e.target.value)} />}</Field>
      </ConfirmDialog>
    </div>
  )
}
