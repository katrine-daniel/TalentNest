import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Check, CheckCircle2, FileText, History, Paperclip, Plus, UserRoundCheck } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import Drawer from '@/components/ui/Drawer'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge, { type Tone } from '@/components/ui/StatusBadge'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { Checkbox, Input, Select } from '@/components/ui/FormControls'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useCollection, useLookups, fullName } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import { fileStorage } from '@/services/storage/fileStorage'
import { useToast } from '@/components/ui/Toast'
import { formatDate, formatRelative, toInputDate, combineDateTime } from '@/utils/formatDate'
import { cn } from '@/utils/cn'
import type { OnboardingPlan, OnboardingTask } from '@/types/domain'
import { onboardingService } from './onboardingService'
import { isTaskOverdue } from './onboardingPlanFactory'

const STATUS: Record<OnboardingPlan['status'], { label: string; tone: Tone }> = {
  'not-started': { label: 'Not started', tone: 'neutral' },
  'in-progress': { label: 'In progress', tone: 'blue' },
  blocked: { label: 'Overdue tasks', tone: 'red' },
  completed: { label: 'Completed', tone: 'green' },
}

function TaskRow({ plan, task, canManage }: { plan: OnboardingPlan; task: OnboardingTask; canManage: boolean }) {
  const { actorId } = useSession()
  const users = useCollection('users')
  const { usersById } = useLookups()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const toggle = useAsyncAction(() => onboardingService.toggleTask(plan.id, task.id, { actorId }))
  const assign = useAsyncAction(
    (ownerId: string | null, dueDate: string | null) => onboardingService.assignTask(plan.id, task.id, { ownerId, dueDate }, { actorId }),
    { success: 'Task updated' },
  )
  const upload = useAsyncAction((file: File) => onboardingService.uploadDocument(plan.id, task.id, file, { actorId }), { success: 'Document stored securely' })
  const overdue = isTaskOverdue(task)

  const openDoc = async () => {
    if (!task.document) return
    try {
      window.open(await fileStorage.url(task.document), '_blank', 'noopener')
    } catch (e) {
      toast.info(e instanceof Error ? e.message : 'File unavailable', 'Document unavailable')
    }
  }

  return (
    <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={task.done}
          aria-label={`Mark “${task.label}” as ${task.done ? 'not done' : 'done'}`}
          disabled={!canManage || toggle.pending}
          onClick={() => toggle.run()}
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed',
            task.done ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong hover:border-brand-400',
          )}
        >
          {task.done && <Check size={12} strokeWidth={3} aria-hidden />}
        </button>
        <div className="min-w-0">
          <p className={cn('text-sm', task.done && 'text-muted line-through')}>{task.label}</p>
          <p className="text-muted flex flex-wrap items-center gap-x-2 text-xs">
            <span>{usersById.get(task.ownerId ?? '')?.name ?? 'Unassigned'}</span>
            {task.dueDate && (
              <span className={overdue ? 'font-medium text-red-600' : undefined}>
                {overdue ? 'Overdue · ' : 'Due '}
                {formatDate(task.dueDate)}
              </span>
            )}
            {task.requiresDocument && !task.document && <span className="text-amber-700">Document required</span>}
            {task.document && (
              <button type="button" onClick={openDoc} className="text-brand-700 inline-flex items-center gap-1 hover:underline">
                <FileText size={12} aria-hidden /> {task.document.fileName}
              </button>
            )}
          </p>
        </div>
      </div>
      {canManage && !task.done && (
        <div className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0">
          <Select
            aria-label={`Owner for ${task.label}`}
            value={task.ownerId ?? ''}
            onChange={(e) => assign.run(e.target.value || null, task.dueDate)}
            options={users.filter((u) => u.status === 'active').map((u) => ({ value: u.id, label: u.name }))}
            placeholder="Unassigned"
            className="h-8! w-36 text-xs"
          />
          <Input
            aria-label={`Due date for ${task.label}`}
            type="date"
            value={task.dueDate ? toInputDate(task.dueDate) : ''}
            onChange={(e) => assign.run(task.ownerId, e.target.value ? combineDateTime(e.target.value, '17:00') : null)}
            className="h-8! w-36 text-xs"
          />
          {task.requiresDocument && (
            <>
              <Button size="xs" icon={Paperclip} loading={upload.pending} onClick={() => fileRef.current?.click()}>
                {task.document ? 'Replace' : 'Upload'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void upload.run(f)
                  e.target.value = ''
                }}
              />
            </>
          )}
        </div>
      )}
    </li>
  )
}

function PlanDetail({ plan, onClose }: { plan: OnboardingPlan | null; onClose: () => void }) {
  const { actorId, can } = useSession()
  const { candidatesById, jobsById, usersById } = useLookups()
  const [label, setLabel] = useState('')
  const [requiresDocument, setRequiresDocument] = useState(false)
  const add = useAsyncAction(
    (p: OnboardingPlan) => onboardingService.addTask(p.id, { label, ownerId: null, dueDate: p.startDate, requiresDocument }, { actorId }),
    { success: 'Task added' },
  )
  if (!plan) return <Drawer open={false} onClose={onClose} title="" />
  const candidate = candidatesById.get(plan.candidateId)
  const done = plan.tasks.filter((t) => t.done).length
  const canManage = can('onboarding.manage')
  return (
    <Drawer
      open
      onClose={onClose}
      title={fullName(candidate)}
      subtitle={`${jobsById.get(plan.jobId)?.title ?? ''} · starts ${formatDate(plan.startDate)}`}
      size="lg"
    >
      <div className="space-y-6 py-5">
        <div className="px-5">
          <div className="flex items-center justify-between text-sm">
            <StatusBadge tone={STATUS[plan.status].tone}>{STATUS[plan.status].label}</StatusBadge>
            <span className="text-muted tabular">
              {done}/{plan.tasks.length} tasks
            </span>
          </div>
          <div className="bg-subtle mt-2 h-2 overflow-hidden rounded-full">
            <div
              className={cn('h-full rounded-full', plan.status === 'completed' ? 'bg-emerald-500' : 'bg-brand-600')}
              style={{ width: `${(done / Math.max(1, plan.tasks.length)) * 100}%` }}
            />
          </div>
          {plan.status === 'completed' && plan.completedAt && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 size={16} aria-hidden /> All {plan.tasks.length} tasks completed on {formatDate(plan.completedAt)} — ready for day one.
            </p>
          )}
        </div>
        <section aria-label="Checklist">
          <ul className="divide-line border-line divide-y border-y">
            {plan.tasks.map((t) => (
              <TaskRow key={t.id} plan={plan} task={t} canManage={canManage} />
            ))}
          </ul>
          {canManage && (
            <form
              className="flex flex-wrap items-center gap-2 px-5 pt-3"
              onSubmit={async (e) => {
                e.preventDefault()
                const res = await add.run(plan)
                if (res.ok) {
                  setLabel('')
                  setRequiresDocument(false)
                }
              }}
            >
              <Input
                aria-label="New onboarding task"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Add a task…"
                className="min-w-40 flex-1"
              />
              <Checkbox label="Needs document" checked={requiresDocument} onChange={(e) => setRequiresDocument(e.target.checked)} />
              <Button type="submit" icon={Plus} disabled={!label.trim()} loading={add.pending}>
                Add
              </Button>
            </form>
          )}
        </section>
        <section className="px-5">
          <h3 className="text-muted mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <History size={13} aria-hidden /> Activity
          </h3>
          <ol className="space-y-1.5 text-sm">
            {[...plan.history].reverse().map((h) => (
              <li key={h.id} className="flex gap-2">
                <span className="text-faint w-20 shrink-0 text-xs">{formatRelative(h.at)}</span>
                <span className="text-ink-soft">
                  {h.text}
                  {h.byId && <span className="text-muted"> · {usersById.get(h.byId)?.name}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Drawer>
  )
}

/** Onboarding workspace: one plan per accepted offer, with owners, due dates and documents. */
export default function OnboardingPage() {
  const plans = useCollection('onboardingPlans')
  const offers = useCollection('offers')
  const templates = useCollection('onboardingTemplates')
  const { candidatesById, jobsById } = useLookups()
  const { actorId, can } = useSession()
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active')
  const [openId, setOpenId] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const start = useAsyncAction((offerId: string) => onboardingService.start(offerId, templateId, { actorId }), { success: 'Onboarding plan created' })

  const withoutPlan = useMemo(() => offers.filter((o) => o.status === 'accepted' && !plans.some((p) => p.offerId === o.id)), [offers, plans])
  const visible = plans
    .filter((p) => (filter === 'all' ? true : filter === 'completed' ? p.status === 'completed' : p.status !== 'completed'))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
  const openPlan = plans.find((p) => p.id === openId) ?? null

  return (
    <div className="space-y-6">
      <PageHeader title="Onboarding" description="Checklists for every accepted offer — owners, due dates and secure documents until day one." />

      {withoutPlan.length > 0 && can('onboarding.manage') && (
        <Panel title="Accepted offers without a plan" description="Usually created automatically; start one manually if the automation rule is off.">
          <ul className="divide-line border-line divide-y border-t">
            {withoutPlan.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 text-sm">
                  <strong className="font-medium">{fullName(candidatesById.get(o.candidateId))}</strong> · {jobsById.get(o.jobId)?.title}
                </span>
                <Select
                  aria-label="Checklist template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  options={templates.map((t) => ({ value: t.id, label: t.name }))}
                  className="h-8! w-48 text-xs"
                />
                <Button size="sm" variant="primary" loading={start.pending} onClick={() => start.run(o.id)} disabled={!templateId}>
                  Start onboarding
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="flex justify-end">
        <SegmentedControl
          label="Filter plans"
          value={filter}
          onChange={(v: string) => setFilter(v as typeof filter)}
          options={[
            { value: 'active', label: 'In progress' },
            { value: 'completed', label: 'Completed' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      {visible.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const c = candidatesById.get(p.candidateId)
            const done = p.tasks.filter((t) => t.done).length
            const overdue = p.tasks.filter((t) => isTaskOverdue(t)).length
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => setOpenId(p.id)}
                className="border-line/80 bg-surface shadow-card hover:border-brand-200 rounded-2xl border p-4 text-left transition-colors"
                aria-label={`Open onboarding for ${fullName(c)}`}
              >
                <div className="flex items-start gap-3">
                  <Avatar name={fullName(c)} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{fullName(c)}</p>
                    <p className="text-muted truncate text-xs">{jobsById.get(p.jobId)?.title}</p>
                    <p className="text-ink-soft mt-1 flex items-center gap-1 text-xs">
                      <CalendarDays size={12} aria-hidden /> Starts {formatDate(p.startDate)} ({formatRelative(p.startDate)})
                    </p>
                  </div>
                  <StatusBadge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</StatusBadge>
                </div>
                <div className="bg-subtle mt-4 h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cn('h-full rounded-full', p.status === 'completed' ? 'bg-emerald-500' : 'bg-brand-600')}
                    style={{ width: `${(done / Math.max(1, p.tasks.length)) * 100}%` }}
                  />
                </div>
                <p className="text-muted mt-2 flex items-center justify-between text-xs">
                  <span>
                    {done}/{p.tasks.length} tasks done
                  </span>
                  {overdue > 0 && (
                    <span className="flex items-center gap-1 font-medium text-red-600">
                      <AlertTriangle size={12} aria-hidden /> {overdue} overdue
                    </span>
                  )}
                </p>
              </button>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={UserRoundCheck}
          title="No onboarding plans here"
          description="Plans appear when an offer is accepted."
          action={
            <Link to="/offers" className="text-brand-700 text-sm hover:underline">
              Go to offers
            </Link>
          }
        />
      )}

      <PlanDetail plan={openPlan} onClose={() => setOpenId(null)} />
    </div>
  )
}
