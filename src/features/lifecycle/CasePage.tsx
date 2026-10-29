import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, CircleSlash, ExternalLink, FileUp, RotateCcw } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import type { LifecycleTask } from '@/domain/types'
import { formatDate, formatDateTime } from '@/lib/dates'
import { cn, fullName } from '@/lib/utils'
import {
  attachTaskDocument,
  cancelCase,
  canManageTask,
  caseProgress,
  completeTask,
  OWNER_LABELS,
  reassignTask,
  reopenTask,
  setTaskDueDate,
  skipTask,
  visibleCases,
} from '@/services/lifecycle'
import { Badge } from '@/components/ui/Badge'
import { Button, LinkButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Checkbox, Input, Select } from '@/components/ui/Form'
import { EmptyState, Panel } from '@/components/ui/Layout'
import { DueLabel, PersonCell } from '@/features/shared/display'

export default function CasePage() {
  const { caseId } = useParams()
  const db = useDb()
  const { account, can } = useSession()
  const c = visibleCases(db, account).find((x) => x.id === caseId)
  const [completing, setCompleting] = useState<LifecycleTask | null>(null)
  const [confirmExternal, setConfirmExternal] = useState(false)
  const [skipping, setSkipping] = useState<LifecycleTask | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [mineOnly, setMineOnly] = useState(false)
  const complete = useAction((t: LifecycleTask, note: string, ext: boolean) => completeTask(account, caseId as string, t.id, note, ext), 'Task completed')
  const reopen = useAction((t: LifecycleTask) => reopenTask(account, caseId as string, t.id), 'Task reopened')
  const skip = useAction((t: LifecycleTask, note: string) => skipTask(account, caseId as string, t.id, note), 'Task skipped')
  const reassign = useAction((t: LifecycleTask, to: string) => reassignTask(account, caseId as string, t.id, to || null), 'Task reassigned')
  const due = useAction((t: LifecycleTask, d: string) => setTaskDueDate(account, caseId as string, t.id, d), 'Due date updated')
  const upload = useAction((t: LifecycleTask, f: File) => attachTaskDocument(account, caseId as string, t.id, f), 'Document uploaded')
  const cancel = useAction((note: string) => cancelCase(account, caseId as string, note), 'Checklist cancelled')

  if (!c) return <EmptyState title="Checklist not found" action={<LinkButton to="/lifecycle">Back</LinkButton>} />
  const e = db.employees.find((x) => x.id === c.employeeId)
  const p = caseProgress(c)
  const manage = can('lifecycle.manage')
  const owners = Object.keys(OWNER_LABELS) as Array<keyof typeof OWNER_LABELS>
  const tasks = [...c.tasks].filter((t) => !mineOnly || t.assigneeId === account.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const name = (id: string | null) => (id ? (db.accounts.find((a) => a.id === id)?.name ?? 'Unknown') : 'HR queue')

  return (
    <div>
      <Link to="/lifecycle" className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={14} aria-hidden /> Onboarding & Offboarding
      </Link>
      <div className="border-line bg-surface shadow-card mb-5 flex flex-col gap-4 rounded-lg border p-5 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="sr-only">
            {c.kind === 'onboarding' ? 'Onboarding' : 'Offboarding'} checklist{e ? ` for ${fullName(e)}` : ''}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={c.kind === 'onboarding' ? 'info' : 'warning'}>{c.kind === 'onboarding' ? 'Onboarding' : 'Offboarding'}</Badge>
            <Badge tone={c.status === 'active' ? 'brand' : c.status === 'completed' ? 'success' : 'neutral'}>{c.status}</Badge>
          </div>
          <div className="mt-2">
            <PersonCell
              employee={e}
              sub={`${c.kind === 'onboarding' ? 'Joins' : 'Last day'} ${formatDate(c.keyDate)} · ${db.lifecycleTemplates.find((t) => t.id === c.templateId)?.name ?? ''}`}
            />
          </div>
        </div>
        <div className="w-full md:w-64">
          <div className="flex justify-between text-xs">
            <span className="text-muted">Progress</span>
            <span className="tabular font-medium">
              {p.done}/{p.total} · {p.percent}%
            </span>
          </div>
          <div
            className="bg-subtle mt-1 h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={p.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Checklist progress"
          >
            <div className="bg-brand-600 h-full" style={{ width: `${p.percent}%` }} />
          </div>
          {p.overdue > 0 && <p className="text-danger mt-1 text-xs font-medium">{p.overdue} task(s) overdue</p>}
        </div>
        {manage && c.status === 'active' && (
          <Button variant="ghost" onClick={() => setCancelling(true)}>
            Cancel checklist
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <Panel title="Tasks" actions={<Checkbox label="Only mine" checked={mineOnly} onChange={(ev) => setMineOnly(ev.target.checked)} />}>
          <ul className="divide-line divide-y">
            {tasks.map((t) => {
              const mayAct = canManageTask(account, t) && c.status === 'active'
              const doc = t.documentId ? e?.documents.find((d) => d.id === t.documentId) : null
              return (
                <li key={t.id} className={cn('px-4 py-3', t.status !== 'open' && 'bg-page/60')}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm font-medium', t.status !== 'open' && 'text-muted line-through decoration-1')}>{t.title}</p>
                      <div className="text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span>{OWNER_LABELS[t.owner]}</span>
                        <span>· {name(t.assigneeId)}</span>
                        {t.status === 'open' ? (
                          <DueLabel due={t.dueDate} />
                        ) : (
                          <span>
                            {t.status === 'done' ? 'Done' : 'Skipped'} {t.completedAt && formatDateTime(t.completedAt)} by {name(t.completedBy)}
                          </span>
                        )}
                        {t.externalAction && (
                          <span className="inline-flex items-center gap-1">
                            <ExternalLink size={11} aria-hidden /> External system
                          </span>
                        )}
                        {t.requiresDocument && <span>{doc ? `Document: ${doc.name}` : 'Document required'}</span>}
                      </div>
                      {t.note && <p className="text-ink-soft mt-1 text-xs">“{t.note}”</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {mayAct && t.status === 'open' && t.requiresDocument && !t.documentId && (
                        <label className="border-line-strong hover:bg-subtle inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium">
                          <FileUp size={14} aria-hidden /> Upload
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                            className="sr-only"
                            onChange={(ev) => ev.target.files?.[0] && void upload.run(t, ev.target.files[0])}
                          />
                        </label>
                      )}
                      {mayAct && t.status === 'open' && (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={Check}
                          onClick={() => {
                            setConfirmExternal(false)
                            setCompleting(t)
                          }}
                        >
                          Complete
                        </Button>
                      )}
                      {manage && t.status === 'open' && c.status === 'active' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          icon={CircleSlash}
                          aria-label={`Skip ${t.title}`}
                          title="Not needed"
                          onClick={() => setSkipping(t)}
                        />
                      )}
                      {manage && t.status !== 'open' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          icon={RotateCcw}
                          aria-label={`Reopen ${t.title}`}
                          title="Reopen"
                          onClick={() => reopen.run(t)}
                        />
                      )}
                    </div>
                  </div>
                  {manage && t.status === 'open' && c.status === 'active' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Select
                        aria-label={`Assignee for ${t.title}`}
                        className="h-8 w-auto text-xs"
                        value={t.assigneeId ?? ''}
                        onChange={(ev) => reassign.run(t, ev.target.value)}
                        placeholder="HR queue"
                        options={db.accounts.filter((a) => a.status === 'active').map((a) => ({ value: a.id, label: a.name }))}
                      />
                      <Input
                        aria-label={`Due date for ${t.title}`}
                        type="date"
                        className="h-8 w-auto text-xs"
                        value={t.dueDate}
                        onChange={(ev) => ev.target.value && due.run(t, ev.target.value)}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Panel>
        <Panel title="Activity">
          <ol className="divide-line divide-y">
            {[...c.timeline].reverse().map((t) => (
              <li key={t.id} className="px-4 py-2.5 text-sm">
                <p>{t.text}</p>
                <p className="text-muted text-xs">
                  {t.by ? name(t.by) : 'System'} · {formatDateTime(t.at)}
                </p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <ConfirmDialog
        open={Boolean(completing)}
        onClose={() => setCompleting(null)}
        title={`Complete “${completing?.title ?? ''}”`}
        description={
          completing?.externalAction
            ? 'This is an action in another system (e.g. accounts, access, payroll). PeopleOS has no integration for it, so completing the task only records your confirmation.'
            : undefined
        }
        confirmLabel="Mark complete"
        note={{ label: 'Note', placeholder: 'Optional' }}
        loading={complete.pending}
        onConfirm={async (note) => {
          if (!completing) return
          const r = await complete.run(completing, note, confirmExternal)
          if (r.ok) setCompleting(null)
        }}
      >
        {completing?.externalAction && (
          <Checkbox label="I confirm this was done in the external system" checked={confirmExternal} onChange={(ev) => setConfirmExternal(ev.target.checked)} />
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(skipping)}
        onClose={() => setSkipping(null)}
        title={`Skip “${skipping?.title ?? ''}”?`}
        confirmLabel="Skip task"
        note={{ label: 'Why is it not needed?', required: true }}
        loading={skip.pending}
        onConfirm={async (note) => {
          if (!skipping) return
          const r = await skip.run(skipping, note)
          if (r.ok) setSkipping(null)
        }}
      />
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel this checklist?"
        description={`Open tasks stop. ${e ? fullName(e) : 'The employee'}’s record is not changed.`}
        tone="danger"
        confirmLabel="Cancel checklist"
        note={{ label: 'Reason', required: true }}
        loading={cancel.pending}
        onConfirm={async (note) => {
          const r = await cancel.run(note)
          if (r.ok) setCancelling(false)
        }}
      />
      {manage && (
        <p className="text-muted mt-3 text-xs">
          Owners: {owners.map((o) => OWNER_LABELS[o]).join(', ')}. Unassigned tasks sit in the HR queue of the HR Inbox.
        </p>
      )}
    </div>
  )
}
