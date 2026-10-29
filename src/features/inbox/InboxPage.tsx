import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlarmClockOff, BellOff, Check, CheckCircle2, ExternalLink, Search, UserPlus, X } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { buildInbox, isSnoozed, KIND_LABELS, type InboxItem, type InboxKind } from '@/domain/inbox'
import { addDays, today } from '@/lib/dates'
import { fullName } from '@/lib/utils'
import { decideLeave } from '@/services/leave'
import { assignRequest, decideRequest, UPDATABLE_FIELDS } from '@/services/requests'
import { completeTask } from '@/services/lifecycle'
import { completeTaskItem } from '@/services/tasks'
import { snoozeInboxItem } from '@/services/notifications'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input, Select } from '@/components/ui/Form'
import { Avatar, EmptyState, PageHeader, Panel, Tabs } from '@/components/ui/Layout'
import { DueLabel, PriorityBadge } from '@/features/shared/display'

const GROUPS: Record<string, InboxKind[]> = {
  all: [],
  approvals: ['leave_approval', 'request_approval', 'record_update'],
  requests: ['request', 'request_followup', 'leave_followup'],
  checklists: ['lifecycle_task', 'document_review'],
  tasks: ['task'],
  acknowledgments: ['policy_ack'],
}

type Decision = { item: InboxItem; decision: 'approved' | 'rejected' | 'changes_requested' }

function ProposedChanges({ id }: { id: string }) {
  const db = useDb()
  const r = db.requests.find((x) => x.id === id)
  const e = db.employees.find((x) => x.id === r?.employeeId)
  if (!r?.proposedChanges || !e) return null
  return (
    <dl className="bg-page border-line mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs">
      {Object.entries(r.proposedChanges).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{UPDATABLE_FIELDS[k] ?? k}</dt>
          <dd>
            <span className="text-muted line-through">{String((e as unknown as Record<string, unknown>)[k] ?? '—')}</span> → <strong>{v}</strong>
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function InboxPage() {
  const db = useDb()
  const { account } = useSession()
  const [params, setParams] = useSearchParams()
  const requested = params.get('filter') ?? ''
  const group = requested in GROUPS ? requested : 'all'
  const [query, setQuery] = useState('')
  const [owner, setOwner] = useState('any')
  const [sort, setSort] = useState<'priority' | 'due'>('priority')
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [decision, setDecision] = useState<Decision | null>(null)

  const all = useMemo(() => buildInbox(db, account), [db, account])
  const active = all.filter((i) => !isSnoozed(db, account.id, i.key))
  const snoozedCount = all.length - active.length
  const items = (showSnoozed ? all.filter((i) => isSnoozed(db, account.id, i.key)) : active)
    .filter((i) => group === 'all' || (GROUPS[group] ?? []).includes(i.kind))
    .filter((i) => owner === 'any' || (owner === 'me' ? i.ownerId === account.id : i.ownerId === null))
    .filter((i) => !query.trim() || `${i.title} ${i.context} ${i.employee ? fullName(i.employee) : ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const sorted = sort === 'due' ? [...items].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999')) : items

  const leave = useAction((d: Decision, note: string) => decideLeave(account, d.item.ref.id, d.decision, note), 'Decision recorded')
  const req = useAction((d: Decision, note: string) => decideRequest(account, d.item.ref.id, d.decision, note), 'Decision recorded')
  const claim = useAction((id: string) => assignRequest(account, id, account.id), 'Assigned to you')
  const doneTask = useAction(
    (i: InboxItem) => (i.kind === 'task' ? completeTaskItem(account, i.ref.id) : completeTask(account, i.ref.parentId as string, i.ref.id, '')),
    'Marked complete',
  )
  const snooze = useAction((key: string, until: string | null) => snoozeInboxItem(account, key, until), 'Updated')

  const counts = Object.fromEntries(Object.entries(GROUPS).map(([g, kinds]) => [g, active.filter((i) => !kinds.length || kinds.includes(i.kind)).length]))
  const canQuickComplete = (i: InboxItem) => {
    if (i.kind === 'task') return true
    if (i.kind !== 'lifecycle_task') return false
    const t = db.lifecycleCases.find((c) => c.id === i.ref.parentId)?.tasks.find((x) => x.id === i.ref.id)
    return Boolean(t && !t.requiresDocument && !t.externalAction)
  }

  return (
    <div>
      <PageHeader
        title="HR Inbox"
        description="Approvals, requests, checklist tasks and acknowledgments from every module — act here or open the record. Completing an item updates the underlying record."
      />
      <Panel>
        <div className="px-4 pt-1">
          <Tabs
            label="Inbox categories"
            value={group}
            onChange={(v) => setParams(v === 'all' ? {} : { filter: v })}
            tabs={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'approvals', label: 'Approvals', count: counts.approvals },
              { value: 'requests', label: 'Requests', count: counts.requests },
              { value: 'checklists', label: 'Checklists', count: counts.checklists },
              { value: 'tasks', label: 'Tasks', count: counts.tasks },
              { value: 'acknowledgments', label: 'Acknowledgments', count: counts.acknowledgments },
            ]}
          />
        </div>
        <div className="border-line flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="relative min-w-48 flex-1">
            <Search size={15} className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
            <Input
              aria-label="Search inbox"
              placeholder="Search by title, person or context"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select
            aria-label="Owner"
            className="w-auto"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            options={[
              { value: 'any', label: 'Any owner' },
              { value: 'me', label: 'Assigned to me' },
              { value: 'queue', label: 'Unassigned / HR queue' },
            ]}
          />
          <Select
            aria-label="Sort"
            className="w-auto"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'priority' | 'due')}
            options={[
              { value: 'priority', label: 'Overdue & priority first' },
              { value: 'due', label: 'Due date' },
            ]}
          />
          <Button size="sm" variant={showSnoozed ? 'primary' : 'ghost'} icon={BellOff} onClick={() => setShowSnoozed((s) => !s)} aria-pressed={showSnoozed}>
            Snoozed ({snoozedCount})
          </Button>
        </div>
        {sorted.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={showSnoozed ? 'No snoozed items' : 'Nothing here'}
            description={showSnoozed ? undefined : 'When work needs you, it appears here with the action to take.'}
          />
        ) : (
          <ul className="divide-line divide-y">
            {sorted.map((i) => {
              const snoozed = isSnoozed(db, account.id, i.key)
              return (
                <li key={i.key} className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {i.employee ? <Avatar name={fullName(i.employee)} size="sm" /> : <span className="bg-subtle size-8 shrink-0 rounded-full" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link to={i.href} className="text-ink text-sm font-medium hover:underline">
                          {i.title}
                        </Link>
                        <PriorityBadge priority={i.priority} hideNormal />
                      </div>
                      <p className="text-muted mt-0.5 text-xs">
                        <span className="text-ink-soft font-medium">{KIND_LABELS[i.kind]}</span>
                        {i.employee && <> · {fullName(i.employee)}</>} · {i.context}
                      </p>
                      <p className="text-muted mt-0.5 text-xs">
                        {i.status} · Owner: {i.ownerLabel}
                      </p>
                      {i.kind === 'record_update' && <ProposedChanges id={i.ref.id} />}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
                    <span className="mr-1 text-xs">
                      <DueLabel due={i.due} />
                    </span>
                    {(i.kind === 'leave_approval' || i.kind === 'request_approval' || i.kind === 'record_update') && (
                      <>
                        <Button size="sm" variant="primary" icon={Check} onClick={() => setDecision({ item: i, decision: 'approved' })}>
                          Approve
                        </Button>
                        <Button size="sm" onClick={() => setDecision({ item: i, decision: 'changes_requested' })}>
                          Request changes
                        </Button>
                        <Button size="sm" variant="ghost" icon={X} onClick={() => setDecision({ item: i, decision: 'rejected' })}>
                          {i.kind === 'leave_approval' ? 'Decline' : 'Reject'}
                        </Button>
                      </>
                    )}
                    {i.kind === 'request' && i.ownerId === null && (
                      <Button size="sm" icon={UserPlus} loading={claim.pending} onClick={() => claim.run(i.ref.id)}>
                        Assign to me
                      </Button>
                    )}
                    {canQuickComplete(i) && (
                      <Button size="sm" icon={Check} loading={doneTask.pending} onClick={() => doneTask.run(i)}>
                        Complete
                      </Button>
                    )}
                    <Link to={i.href} className="text-brand-700 inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] font-medium hover:underline">
                      Open <ExternalLink size={13} aria-hidden />
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      icon={snoozed ? BellOff : AlarmClockOff}
                      aria-label={snoozed ? `Unsnooze ${i.title}` : `Snooze ${i.title} until tomorrow`}
                      title={snoozed ? 'Unsnooze' : 'Snooze until tomorrow'}
                      onClick={() => snooze.run(i.key, snoozed ? null : `${addDays(today(), 1)}T08:00:00`)}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      <ConfirmDialog
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={
          decision?.decision === 'approved'
            ? 'Approve?'
            : decision?.decision === 'rejected'
              ? decision.item.kind === 'leave_approval'
                ? 'Decline leave?'
                : 'Reject request?'
              : 'Request changes?'
        }
        description={
          decision ? `${decision.item.title}${decision.item.employee ? ` — ${fullName(decision.item.employee)}` : ''}. The requester is notified.` : ''
        }
        confirmLabel={
          decision?.decision === 'approved'
            ? 'Approve'
            : decision?.decision === 'rejected'
              ? decision.item.kind === 'leave_approval'
                ? 'Decline'
                : 'Reject'
              : 'Request changes'
        }
        tone={decision?.decision === 'rejected' ? 'danger' : 'primary'}
        note={{
          label: 'Comment',
          required: decision?.decision !== 'approved',
          placeholder: decision?.decision === 'approved' ? 'Optional' : 'Explain the decision to the requester',
        }}
        loading={leave.pending || req.pending}
        onConfirm={async (note) => {
          if (!decision) return
          const res = decision.item.kind === 'leave_approval' ? await leave.run(decision, note) : await req.run(decision, note)
          if (res.ok) setDecision(null)
        }}
      />
    </div>
  )
}
