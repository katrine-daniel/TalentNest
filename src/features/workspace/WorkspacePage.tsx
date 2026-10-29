import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardList, Megaphone, Plus, Sparkles, UserRoundCheck } from 'lucide-react'
import { useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { buildInbox, isSnoozed, KIND_LABELS, type InboxItem } from '@/domain/inbox'
import { leaveBalance } from '@/domain/leave'
import { isHR, reportIds } from '@/domain/permissions'
import { isOverdue, isOpenRequest } from '@/domain/sla'
import { addDays, daysBetween, formatDate, formatRelative, parseISODate, rangesOverlap, today } from '@/lib/dates'
import { fullName } from '@/lib/utils'
import { caseProgress, visibleCases } from '@/services/lifecycle'
import { visibleLeave } from '@/services/leave'
import { visibleRequests } from '@/services/requests'
import { LinkButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar, EmptyState, Panel } from '@/components/ui/Layout'
import { DueLabel, LeaveStatusBadge, PriorityBadge, RequestStatusBadge } from '@/features/shared/display'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function AttentionList({ items }: { items: InboxItem[] }) {
  if (!items.length)
    return (
      <EmptyState icon={CheckCircle2} title="You’re all caught up" description="New approvals, tasks and requests assigned to you will appear here." compact />
    )
  return (
    <ul className="divide-line divide-y">
      {items.map((i) => (
        <li key={i.key}>
          <Link to={i.href} className="hover:bg-page flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-ink truncate text-sm font-medium">{i.title}</span>
                <PriorityBadge priority={i.priority} hideNormal />
              </span>
              <span className="text-muted block truncate text-xs">
                {KIND_LABELS[i.kind]}
                {i.employee ? ` · ${fullName(i.employee)}` : ''} · {i.context}
              </span>
            </span>
            <span className="hidden shrink-0 text-xs sm:block">
              <DueLabel due={i.due} />
            </span>
            <ArrowRight size={15} className="text-muted shrink-0" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Milestones() {
  const db = useDb()
  const T = today()
  const soon = addDays(T, 21)
  const items = useMemo(() => {
    const out: Array<{ key: string; date: string; text: string; href: string; tone: 'info' | 'success' | 'warning' }> = []
    for (const e of db.employees) {
      if (e.status === 'terminated') continue
      if (e.joinDate >= T && e.joinDate <= soon)
        out.push({ key: `j${e.id}`, date: e.joinDate, text: `${fullName(e)} joins as ${e.title}`, href: `/people/${e.id}`, tone: 'info' })
      if (e.endDate && e.endDate >= T && e.endDate <= soon)
        out.push({ key: `l${e.id}`, date: e.endDate, text: `${fullName(e)}’s last working day`, href: `/people/${e.id}`, tone: 'warning' })
      const join = parseISODate(e.joinDate)
      const years = parseISODate(T).getFullYear() - join.getFullYear()
      if (years > 0) {
        const anniversary = `${parseISODate(T).getFullYear()}-${e.joinDate.slice(5)}`
        if (anniversary >= T && anniversary <= soon)
          out.push({
            key: `a${e.id}`,
            date: anniversary,
            text: `${fullName(e)} — ${years} year${years > 1 ? 's' : ''} with the company`,
            href: `/people/${e.id}`,
            tone: 'success',
          })
      }
      for (const d of e.documents)
        if (d.expiresOn && d.expiresOn >= T && d.expiresOn <= addDays(T, 30))
          out.push({
            key: `d${d.id}`,
            date: d.expiresOn,
            text: `${d.name.replace(/\.\w+$/, '')} expires — ${fullName(e)}`,
            href: `/people/${e.id}`,
            tone: 'warning',
          })
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8)
  }, [db, T, soon])
  return (
    <Panel title="Upcoming milestones" actions={<span className="text-muted text-xs">Next 3 weeks</span>}>
      {items.length ? (
        <ul className="divide-line divide-y">
          {items.map((m) => (
            <li key={m.key}>
              <Link to={m.href} className="hover:bg-page flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="tabular text-muted w-14 shrink-0 text-xs">{formatDate(m.date, { short: true })}</span>
                <span className="min-w-0 flex-1 truncate">{m.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No joiners, leavers, anniversaries or expiries soon" compact />
      )}
    </Panel>
  )
}

function Announcements() {
  const db = useDb()
  const { account } = useSession()
  const me = db.employees.find((e) => e.id === account.employeeId)
  const list = db.announcements.filter((a) => !a.audienceDepartmentIds || (me && a.audienceDepartmentIds.includes(me.departmentId))).slice(0, 3)
  if (!list.length) return null
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Megaphone size={15} aria-hidden /> Announcements
        </span>
      }
    >
      <ul className="divide-line divide-y">
        {list.map((a) => (
          <li key={a.id} className="px-4 py-3">
            <p className="text-sm font-medium">{a.title}</p>
            <p className="text-ink-soft mt-0.5 text-sm">{a.body}</p>
            <p className="text-muted mt-1 text-xs">{formatRelative(a.publishedAt)}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function HRPanels() {
  const db = useDb()
  const { account } = useSession()
  const reqs = db.requests.filter(isOpenRequest)
  const queue = [
    { label: 'Unassigned', value: reqs.filter((r) => !r.assigneeId && r.status !== 'pending_approval').length, href: '/requests?view=queue&filter=unassigned' },
    { label: 'Assigned to me', value: reqs.filter((r) => r.assigneeId === account.id).length, href: '/requests?view=queue&filter=mine' },
    { label: 'Overdue', value: reqs.filter((r) => isOverdue(r)).length, href: '/requests?view=queue&filter=overdue', danger: true },
    { label: 'Awaiting approval', value: reqs.filter((r) => r.status === 'pending_approval').length, href: '/requests?view=queue&filter=approval' },
  ]
  const cases = visibleCases(db, account).filter((c) => c.status === 'active')
  return (
    <>
      <Panel
        title="Service desk"
        actions={
          <Link to="/requests?view=queue" className="text-brand-700 text-xs font-medium hover:underline">
            Open queue
          </Link>
        }
      >
        <ul className="grid grid-cols-2 sm:grid-cols-4">
          {queue.map((q) => (
            <li key={q.label} className="border-line border-b last:border-0 sm:border-r sm:border-b-0">
              <Link to={q.href} className="hover:bg-page block px-4 py-3">
                <span className="text-muted block text-xs">{q.label}</span>
                <span className={`tabular mt-0.5 block text-xl font-semibold ${q.danger && q.value ? 'text-danger' : ''}`}>{q.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel
        title="Onboarding & offboarding"
        actions={
          <Link to="/lifecycle" className="text-brand-700 text-xs font-medium hover:underline">
            View all
          </Link>
        }
      >
        {cases.length ? (
          <ul className="divide-line divide-y">
            {cases.slice(0, 5).map((c) => {
              const e = db.employees.find((x) => x.id === c.employeeId)
              const p = caseProgress(c)
              const next = c.tasks.filter((t) => t.status === 'open').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
              return (
                <li key={c.id}>
                  <Link to={`/lifecycle/${c.id}`} className="hover:bg-page flex items-center gap-3 px-4 py-3">
                    <Avatar name={e ? fullName(e) : '?'} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {e ? fullName(e) : 'Unknown'}
                        <Badge tone={c.kind === 'onboarding' ? 'info' : 'warning'}>
                          {c.kind === 'onboarding' ? 'Joining' : 'Leaving'} {formatDate(c.keyDate, { short: true })}
                        </Badge>
                      </span>
                      <span className="text-muted block truncate text-xs">{next ? `Next: ${next.title}` : 'All tasks done'}</span>
                    </span>
                    <span className="w-24 shrink-0">
                      <span
                        className="bg-subtle block h-1.5 overflow-hidden rounded-full"
                        role="progressbar"
                        aria-valuenow={p.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Checklist progress"
                      >
                        <span className="bg-brand-600 block h-full" style={{ width: `${p.percent}%` }} />
                      </span>
                      <span className={`mt-1 block text-right text-[11px] ${p.overdue ? 'text-danger font-medium' : 'text-muted'}`}>
                        {p.overdue ? `${p.overdue} overdue` : `${p.done}/${p.total}`}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState icon={UserRoundCheck} title="No active checklists" compact />
        )}
      </Panel>
    </>
  )
}

function TeamPanel() {
  const db = useDb()
  const { account } = useSession()
  const team = reportIds(db.employees, account.employeeId)
  const T = today()
  const week = addDays(T, 7)
  const away = visibleLeave(db, account).filter((l) => team.has(l.employeeId) && l.status === 'approved' && rangesOverlap(l.startDate, l.endDate, T, week))
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <CalendarDays size={15} aria-hidden /> My team this week
        </span>
      }
      actions={
        <Link to="/leave?tab=team" className="text-brand-700 text-xs font-medium hover:underline">
          Team calendar
        </Link>
      }
    >
      {away.length ? (
        <ul className="divide-line divide-y">
          {away.map((l) => {
            const e = db.employees.find((x) => x.id === l.employeeId)
            return (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Avatar name={e ? fullName(e) : '?'} size="xs" />
                <span className="flex-1">{e ? fullName(e) : ''}</span>
                <span className="text-muted text-xs">
                  {formatDate(l.startDate, { short: true })} – {formatDate(l.endDate, { short: true })}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted px-4 py-4 text-sm">Nobody in your team has approved leave in the next 7 days. {team.size} people report to you.</p>
      )}
    </Panel>
  )
}

function EmployeePanels() {
  const db = useDb()
  const { account } = useSession()
  const year = new Date().getFullYear()
  const annual = db.leaveTypes.find((t) => t.tracked && t.active)
  const bal = account.employeeId && annual ? leaveBalance(db, account.employeeId, annual.id, year) : null
  const myRequests = visibleRequests(db, account).filter((r) => r.requesterId === account.id && isOpenRequest(r))
  const myLeave = visibleLeave(db, account).filter(
    (l) => l.employeeId === account.employeeId && l.endDate >= today() && l.status !== 'cancelled' && l.status !== 'rejected',
  )
  return (
    <>
      {bal && annual && (
        <Panel
          title={`${annual.name} ${year}`}
          actions={
            <Link to="/leave" className="text-brand-700 text-xs font-medium hover:underline">
              Details
            </Link>
          }
        >
          <div className="flex items-end gap-6 px-4 py-4">
            <div>
              <p className="tabular text-3xl font-semibold tracking-tight">{bal.available}</p>
              <p className="text-muted text-xs">days available</p>
            </div>
            <dl className="text-muted grid grid-cols-3 gap-4 text-xs">
              <div>
                <dt>Entitlement</dt>
                <dd className="text-ink tabular text-sm">{bal.entitlement + bal.adjustments}</dd>
              </div>
              <div>
                <dt>Taken</dt>
                <dd className="text-ink tabular text-sm">{bal.taken}</dd>
              </div>
              <div>
                <dt>Pending</dt>
                <dd className="text-ink tabular text-sm">{bal.pending}</dd>
              </div>
            </dl>
          </div>
          {myLeave.length > 0 && (
            <ul className="divide-line border-line divide-y border-t">
              {myLeave.slice(0, 3).map((l) => (
                <li key={l.id}>
                  <Link to={`/leave/${l.id}`} className="hover:bg-page flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="flex-1">
                      {formatDate(l.startDate, { short: true })} – {formatDate(l.endDate, { short: true })} · {l.days} day(s)
                    </span>
                    <LeaveStatusBadge status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      <Panel
        title="My open requests"
        actions={
          <Link to="/requests" className="text-brand-700 text-xs font-medium hover:underline">
            All requests
          </Link>
        }
      >
        {myRequests.length ? (
          <ul className="divide-line divide-y">
            {myRequests.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link to={`/requests/${r.id}`} className="hover:bg-page flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{r.subject}</span>
                  <RequestStatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No open requests"
            compact
            action={
              <Link to="/requests/new" className="text-brand-700 text-sm font-medium hover:underline">
                Ask HR for something
              </Link>
            }
          />
        )}
      </Panel>
    </>
  )
}

function RecentActivity() {
  const db = useDb()
  const name = (id: string | null) => (id ? (db.accounts.find((a) => a.id === id)?.name ?? 'Someone') : 'System')
  return (
    <Panel title="Recent activity">
      <ul className="divide-line divide-y">
        {db.audit.slice(0, 8).map((a) => (
          <li key={a.id} className="px-4 py-2.5 text-sm">
            <p className="truncate">
              <span className="font-medium">{name(a.actorId)}</span> <span className="text-ink-soft">· {a.summary}</span>
            </p>
            <p className="text-muted text-xs">{formatRelative(a.at)}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export default function WorkspacePage() {
  const db = useDb()
  const { account, can } = useSession()
  const inbox = useMemo(() => buildInbox(db, account).filter((i) => !isSnoozed(db, account.id, i.key)), [db, account])
  const hr = isHR(account)
  const manager = account.role === 'manager' || reportIds(db.employees, account.employeeId).size > 0
  const overdue = inbox.filter((i) => i.overdue).length
  const approvals = inbox.filter((i) => ['leave_approval', 'request_approval', 'record_update'].includes(i.kind)).length
  const dueWeek = inbox.filter((i) => i.due && !i.overdue && daysBetween(today(), i.due.slice(0, 10)) <= 7).length
  const first = account.name.split(' ')[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted text-sm">{formatDate(today())}</p>
          <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight">
            {greeting()}, {first}
          </h1>
          <p className="text-ink-soft mt-1 text-sm">
            {inbox.length === 0 ? (
              'Nothing needs your attention right now.'
            ) : (
              <>
                You have <strong>{inbox.length}</strong> open item{inbox.length === 1 ? '' : 's'}
                {overdue > 0 && (
                  <>
                    , <strong className="text-danger">{overdue} overdue</strong>
                  </>
                )}
                {approvals > 0 && <>, {approvals} awaiting your decision</>}
                {dueWeek > 0 && <>, {dueWeek} due this week</>}.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/assistant" variant="ai" icon={Sparkles}>
            Ask the assistant
          </LinkButton>
          {can('people.manage') ? (
            <LinkButton to="/people?new=1" icon={Plus}>
              Add employee
            </LinkButton>
          ) : (
            <LinkButton to="/leave/new" icon={Plus}>
              Request leave
            </LinkButton>
          )}
          <LinkButton to="/requests/new" variant="primary" icon={Plus}>
            New request
          </LinkButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Needs your attention"
            actions={
              <Link to="/inbox" className="text-brand-700 text-xs font-medium hover:underline">
                Open HR Inbox ({inbox.length})
              </Link>
            }
          >
            <AttentionList items={inbox.slice(0, 7)} />
          </Panel>
          {hr && <HRPanels />}
          {!hr && <EmployeePanels />}
        </div>
        <div className="min-w-0 space-y-6">
          {manager && <TeamPanel />}
          {(hr || manager) && <Milestones />}
          <Announcements />
          {hr && <RecentActivity />}
        </div>
      </div>
    </div>
  )
}
