import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { History, Info, Pencil, Play, Plus, RotateCcw, Trash2, Workflow } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useAuth, useSession } from '@/app/session'
import { ACTION_LABELS, CONDITION_FIELDS, OPERATORS, TRIGGERS } from '@/domain/automation'
import type { WorkflowRule, WorkflowRun } from '@/domain/types'
import { formatDateTime, formatRelative } from '@/lib/dates'
import { deleteRule, retryRun, runScheduledChecks, setRuleEnabled } from '@/services/automation'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Select } from '@/components/ui/Form'
import { EmptyState, PageHeader, Panel, Tabs } from '@/components/ui/Layout'
import { Dialog } from '@/components/ui/Overlay'
import { RuleEditor } from './RuleEditor'

const RUN_TONE: Record<WorkflowRun['status'], Tone> = { succeeded: 'success', failed: 'danger', test: 'info' }
const trigger = (t: string) => TRIGGERS.find((x) => x.value === t)?.label ?? t

export default function AutomationPage() {
  const db = useDb()
  const { account } = useSession()
  const { mode } = useAuth()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('rules')
  const [editing, setEditing] = useState<WorkflowRule | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [deleting, setDeleting] = useState<WorkflowRule | null>(null)
  const [historyOf, setHistoryOf] = useState<WorkflowRule | null>(null)
  const [runFilter, setRunFilter] = useState('')
  const toggle = useAction((r: WorkflowRule) => setRuleEnabled(account, r.id, !r.enabled), 'Rule updated')
  const remove = useAction((id: string) => deleteRule(account, id), 'Rule deleted')
  const retry = useAction(
    (id: string) => retryRun(account, id),
    (r: WorkflowRun) => (r.status === 'succeeded' ? 'Retry succeeded' : 'Retry failed again — see the run log'),
  )
  const scheduled = useAction(
    () => runScheduledChecks(),
    (r) => `Scheduled checks ran: ${r.events} event(s), ${r.retries} retr${r.retries === 1 ? 'y' : 'ies'}`,
  )

  useEffect(() => {
    if (params.get('new')) {
      setEditing(null)
      setEditorOpen(true)
    }
    const id = params.get('rule')
    if (id) {
      const r = db.rules.find((x) => x.id === id)
      if (r) {
        setEditing(r)
        setEditorOpen(true)
      }
    }
    if (params.get('new') || params.get('rule')) setParams({}, { replace: true })
  }, [params, setParams, db.rules])

  const runs = db.runs.filter((r) => !runFilter || r.status === runFilter || r.ruleId === runFilter)
  const userName = (id: string | null) => (id ? (db.accounts.find((a) => a.id === id)?.name ?? 'Unknown') : 'System')

  return (
    <div>
      <PageHeader
        title="Workflows & Automation"
        description="Rules that create tasks, notify people, request approvals and start checklists when HR events happen."
        actions={
          <>
            <Button icon={Play} loading={scheduled.pending} onClick={() => scheduled.run()}>
              Run scheduled checks now
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => {
                setEditing(null)
                setEditorOpen(true)
              }}
            >
              New rule
            </Button>
          </>
        }
      />
      <div className="bg-info-soft text-info mb-5 flex gap-3 rounded-md px-4 py-3 text-sm">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        <p className="text-ink-soft">
          {mode === 'demo'
            ? 'Demo workspace: rules run in this browser — event rules right after the change, scheduled rules every 10 minutes while the app is open (or when you click “Run scheduled checks now”). There is no background server in the demo.'
            : 'Event rules run right after the change that triggers them. Scheduled rules (joins, overdue work, expiring documents) run on the server through the automation Edge Function schedule — see docs/deployment.md.'}{' '}
          Every rule runs at most once per record; failed runs are retried up to the rule’s attempt limit.
        </p>
      </div>
      <Panel>
        <div className="px-4 pt-1">
          <Tabs
            label="Automation views"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'rules', label: 'Rules', count: db.rules.length },
              { value: 'runs', label: 'Execution log', count: db.runs.length },
            ]}
          />
        </div>
        {tab === 'rules' ? (
          db.rules.length ? (
            <ul className="divide-line divide-y">
              {db.rules.map((r) => {
                const lastRun = db.runs.find((x) => x.ruleId === r.id)
                const failures = db.runs.filter((x) => x.ruleId === r.id && x.status === 'failed').length
                return (
                  <li key={r.id} className="px-4 py-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{r.name}</p>
                          <Badge tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'On' : 'Off'}</Badge>
                          {failures > 0 && <Badge tone="danger">{failures} failed run(s)</Badge>}
                        </div>
                        {r.description && <p className="text-muted text-sm">{r.description}</p>}
                        <p className="text-ink-soft mt-2 text-sm">
                          <strong>When</strong> {trigger(r.trigger).toLowerCase()}
                          {r.conditions.length > 0 && (
                            <>
                              {' '}
                              <strong>if</strong>{' '}
                              {r.conditions
                                .map(
                                  (c) =>
                                    `${CONDITION_FIELDS.find((f) => f.value === c.field)?.label.toLowerCase() ?? c.field} ${OPERATORS.find((o) => o.value === c.operator)?.label} “${c.value}”`,
                                )
                                .join(' and ')}
                            </>
                          )}{' '}
                          <strong>then</strong> {r.actions.map((a) => ACTION_LABELS[a.type].toLowerCase()).join(', ')}.
                        </p>
                        <p className="text-muted mt-1 text-xs">{lastRun ? `Last run ${formatRelative(lastRun.at)} · ${lastRun.status}` : 'Has not run yet'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" onClick={() => toggle.run(r)}>
                          {r.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button size="sm" variant="ghost" iconOnly icon={History} aria-label={`Change history of ${r.name}`} onClick={() => setHistoryOf(r)} />
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          icon={Pencil}
                          aria-label={`Edit ${r.name}`}
                          onClick={() => {
                            setEditing(r)
                            setEditorOpen(true)
                          }}
                        />
                        <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)} />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Workflow}
              title="No rules yet"
              description="Automate repetitive follow-ups — for example, start onboarding when a new hire is added."
            />
          )
        ) : (
          <>
            <div className="border-line border-b px-4 py-3">
              <Select
                aria-label="Filter runs"
                className="w-auto"
                value={runFilter}
                onChange={(e) => setRunFilter(e.target.value)}
                placeholder="All runs"
                options={[
                  { value: 'failed', label: 'Failed' },
                  { value: 'succeeded', label: 'Succeeded' },
                  ...db.rules.map((r) => ({ value: r.id, label: r.name })),
                ]}
              />
            </div>
            {runs.length ? (
              <ul className="divide-line divide-y">
                {runs.slice(0, 200).map((run) => {
                  const rule = db.rules.find((r) => r.id === run.ruleId)
                  return (
                    <li key={run.id} className="flex flex-col gap-2 px-4 py-3 text-sm md:flex-row md:items-start">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{run.ruleName}</span>
                          <Badge tone={RUN_TONE[run.status]}>{run.status}</Badge>
                          <span className="text-muted text-xs">
                            {trigger(run.trigger)} · attempt {run.attempts} · {run.executor} · {formatDateTime(run.at)}
                          </span>
                        </p>
                        <ul className="mt-1 space-y-0.5 text-xs">
                          {run.results.map((x, i) => (
                            <li key={i} className={x.outcome === 'failed' ? 'text-danger' : x.outcome === 'skipped' ? 'text-warning' : 'text-ink-soft'}>
                              {x.outcome === 'done' ? '✓' : x.outcome === 'skipped' ? '–' : '✗'} {x.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {run.status === 'failed' && rule && db.runs.find((r) => r.dedupeKey === run.dedupeKey)?.id === run.id && (
                        <Button size="sm" icon={RotateCcw} loading={retry.pending} onClick={() => retry.run(run.id)}>
                          Retry ({run.attempts}/{rule.maxAttempts})
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState title="No runs recorded" description="Runs appear when an event matches an enabled rule." />
            )}
          </>
        )}
      </Panel>
      <RuleEditor open={editorOpen} onClose={() => setEditorOpen(false)} rule={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this rule?"
        description={`“${deleting?.name}” stops running. Its execution history is kept.`}
        tone="danger"
        confirmLabel="Delete rule"
        loading={remove.pending}
        onConfirm={async () => {
          if (!deleting) return
          const r = await remove.run(deleting.id)
          if (r.ok) setDeleting(null)
        }}
      />
      <Dialog open={Boolean(historyOf)} onClose={() => setHistoryOf(null)} title={`Change history — ${historyOf?.name ?? ''}`} size="sm">
        <ol className="space-y-2 text-sm">
          {[...(historyOf?.changeLog ?? [])].reverse().map((c) => (
            <li key={c.id}>
              {c.text}
              <span className="text-muted block text-xs">
                {userName(c.by)} · {formatDateTime(c.at)}
              </span>
            </li>
          ))}
        </ol>
      </Dialog>
    </div>
  )
}
