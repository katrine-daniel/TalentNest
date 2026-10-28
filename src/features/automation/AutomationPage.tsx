import { useState } from 'react'
import { Info, Pencil, Play, Plus, Trash2, Workflow } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge, { type Tone } from '@/components/ui/StatusBadge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useCollection, useLookups } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatRelative } from '@/utils/formatDate'
import type { AutomationRule, AutomationRun } from '@/types/domain'
import { CONDITION_FIELDS, OPERATORS, TRIGGERS } from './automationEngine'
import { runScheduledChecks } from './automationService'
import { automationRuleService } from './automationRuleService'
import RuleEditor from './components/RuleEditor'

const RUN_TONE: Record<AutomationRun['status'], Tone> = { success: 'green', skipped: 'neutral', failed: 'red', 'dry-run': 'blue' }
const triggerLabel = (t: string) => TRIGGERS.find((x) => x.value === t)?.label ?? t

function RuleCard({ rule, onEdit, onDelete }: { rule: AutomationRule; onEdit: () => void; onDelete: () => void }) {
  const { actorId, can } = useSession()
  const runs = useCollection('automationRuns').filter((r) => r.ruleId === rule.id)
  const toggle = useAsyncAction((enabled: boolean) => automationRuleService.setEnabled(rule.id, enabled, { actorId }), {
    success: (r: AutomationRule) => (r.enabled ? 'Rule enabled' : 'Rule paused'),
  })
  const editable = can('automation.manage')

  return (
    <li className="border-line/80 bg-surface rounded-2xl border p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-ink font-semibold">{rule.name}</h3>
          {rule.description && <p className="text-muted text-sm">{rule.description}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            className="accent-brand-600 size-4"
            checked={rule.enabled}
            disabled={!editable || toggle.pending}
            onChange={(e) => toggle.run(e.target.checked)}
            aria-label={`${rule.name} enabled`}
          />
          {rule.enabled ? 'On' : 'Paused'}
        </label>
        {editable && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" iconOnly icon={Pencil} aria-label={`Edit ${rule.name}`} onClick={onEdit} />
            <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Delete ${rule.name}`} onClick={onDelete} />
          </div>
        )}
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted text-xs">When</dt>
          <dd>{triggerLabel(rule.trigger)}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs">If</dt>
          <dd>
            {rule.conditions.length
              ? rule.conditions
                  .map(
                    (c) =>
                      `${CONDITION_FIELDS.find((f) => f.value === c.field)?.label ?? c.field} ${OPERATORS.find((o) => o.value === c.operator)?.label} “${c.value}”`,
                  )
                  .join(' and ')
              : 'Always'}
          </dd>
        </div>
        <div>
          <dt className="text-muted text-xs">Then</dt>
          <dd>{rule.actions.map((a) => a.type.replace(/_/g, ' ')).join(', ')}</dd>
        </div>
      </dl>
      <p className="text-muted mt-2 text-xs">
        {runs.length ? `Ran ${runs.length} time${runs.length === 1 ? '' : 's'} · last ${formatRelative(runs[0]!.at)}` : 'Has not run yet'}
      </p>
    </li>
  )
}

export default function AutomationPage() {
  const rules = useCollection('automationRules')
  const runs = useCollection('automationRuns')
  const { usersById } = useLookups()
  const { actorId, can } = useSession()
  const toast = useToast()
  const [tab, setTab] = useState('rules')
  const [editing, setEditing] = useState<AutomationRule | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [deleting, setDeleting] = useState<AutomationRule | null>(null)
  const remove = useAsyncAction((id: string) => automationRuleService.remove(id, { actorId }), { success: 'Rule deleted' })
  const editable = can('automation.manage')

  return (
    <div className="space-y-5">
      <PageHeader
        title="Automation"
        description="Rules that create tasks, send notifications or start onboarding when recruiting events happen."
        actions={
          editable && (
            <>
              <Button
                icon={Play}
                onClick={() => {
                  const n = runScheduledChecks()
                  toast.success(n ? `Checked ${n} interview(s) with overdue feedback` : 'No overdue feedback found')
                }}
              >
                Run scheduled checks
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
          )
        }
      />

      <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-sm dark:border-sky-900 dark:bg-sky-950/30">
        <Info size={16} className="mt-0.5 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />
        <p className="text-ink-soft">
          {isSupabaseConfigured()
            ? 'Event rules run in the browser of the person who makes the change. Time-based checks (overdue feedback) need the automation-scheduler Edge Function to be deployed on a schedule; until then use “Run scheduled checks”.'
            : 'Demo mode: rules run in this browser when you make a change. There is no background server, so time-based checks (overdue feedback) only run when you click “Run scheduled checks”.'}{' '}
          Each rule acts at most once per record and event.
        </p>
      </div>

      <div className="border-line/80 bg-surface shadow-card rounded-2xl border">
        <div className="px-4 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            label="Automation sections"
            tabs={[
              { value: 'rules', label: 'Rules', count: rules.length },
              { value: 'history', label: 'Run history', count: runs.length },
            ]}
          />
        </div>
        <div className="p-4">
          {tab === 'rules' ? (
            rules.length ? (
              <ul className="space-y-3">
                {rules.map((r) => (
                  <RuleCard
                    key={r.id}
                    rule={r}
                    onEdit={() => {
                      setEditing(r)
                      setEditorOpen(true)
                    }}
                    onDelete={() => setDeleting(r)}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState icon={Workflow} title="No automation rules" description="Create a rule to remove repetitive follow-ups." />
            )
          ) : runs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Automation run history</caption>
                <thead>
                  <tr className="text-muted text-left text-xs">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      When
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Rule
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      What happened
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 200).map((r) => (
                    <tr key={r.id} className="border-line/70 border-t align-top">
                      <td className="text-muted py-2 pr-4 whitespace-nowrap">{formatRelative(r.at)}</td>
                      <td className="py-2 pr-4">
                        {r.ruleName}
                        <span className="text-muted block text-xs">{triggerLabel(r.trigger)}</span>
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge tone={RUN_TONE[r.status]}>{r.status}</StatusBadge>
                      </td>
                      <td className="text-ink-soft py-2">{r.actions.length ? r.actions.join('; ') : r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No runs yet" description="Runs appear here when an event matches an enabled rule." />
          )}
        </div>
      </div>

      <RuleEditor open={editorOpen} onClose={() => setEditorOpen(false)} rule={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this rule?"
        description={
          deleting
            ? `“${deleting.name}” will stop running. Its run history is kept.${deleting.createdById ? ` Created by ${usersById.get(deleting.createdById)?.name ?? 'unknown'}.` : ''}`
            : undefined
        }
        confirmLabel="Delete rule"
        tone="danger"
        loading={remove.pending}
        onConfirm={async () => {
          if (!deleting) return
          const res = await remove.run(deleting.id)
          if (res.ok) setDeleting(null)
        }}
      />
    </div>
  )
}
