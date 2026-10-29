import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { canDecide } from '@/domain/approvals'
import { holidaysFor, leaveBalance } from '@/domain/leave'
import { reportIds } from '@/domain/permissions'
import type { LeaveRequest } from '@/domain/types'
import { eachDay, formatDate, parseISODate, toISODate, today } from '@/lib/dates'
import { cn, fullName } from '@/lib/utils'
import { visibleLeave } from '@/services/leave'
import { Button, LinkButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Form'
import { EmptyState, PageHeader, Panel, Tabs } from '@/components/ui/Layout'
import { Table } from '@/components/ui/Table'
import { LeaveStatusBadge, PersonCell } from '@/features/shared/display'

function LeaveTable({ rows, showEmployee }: { rows: LeaveRequest[]; showEmployee?: boolean }) {
  const db = useDb()
  const navigate = useNavigate()
  return (
    <Table
      caption="Leave requests"
      rows={rows}
      rowKey={(l) => l.id}
      onRowClick={(l) => navigate(`/leave/${l.id}`)}
      empty={<EmptyState icon={CalendarDays} title="No leave requests" compact />}
      columns={[
        ...(showEmployee
          ? [{ key: 'emp', header: 'Employee', cell: (l: LeaveRequest) => <PersonCell employee={db.employees.find((e) => e.id === l.employeeId)} /> }]
          : []),
        {
          key: 'dates',
          header: 'Dates',
          cell: (l) => (
            <a
              href={`${import.meta.env.BASE_URL}leave/${l.id}`}
              onClick={(e) => {
                e.preventDefault()
                navigate(`/leave/${l.id}`)
              }}
              className="hover:underline"
            >
              {formatDate(l.startDate)} – {formatDate(l.endDate)}
            </a>
          ),
        },
        { key: 'type', header: 'Type', hideBelow: 'sm', cell: (l) => db.leaveTypes.find((t) => t.id === l.leaveTypeId)?.name },
        { key: 'days', header: 'Days', align: 'right', cell: (l) => <span className="tabular">{l.days}</span> },
        { key: 'status', header: 'Status', cell: (l) => <LeaveStatusBadge status={l.status} /> },
      ]}
    />
  )
}

function TeamCalendar({ people }: { people: string[] }) {
  const db = useDb()
  const { account } = useSession()
  const [anchor, setAnchor] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return toISODate(d)
  })
  const [dept, setDept] = useState('')
  const monthEnd = (() => {
    const d = parseISODate(anchor)
    d.setMonth(d.getMonth() + 1, 0)
    return toISODate(d)
  })()
  const days = eachDay(anchor, monthEnd)
  const leaves = visibleLeave(db, account).filter((l) => ['approved', 'pending'].includes(l.status) && l.startDate <= monthEnd && l.endDate >= anchor)
  const rows = db.employees
    .filter((e) => people.includes(e.id) && (!dept || e.departmentId === dept) && e.status !== 'terminated')
    .sort((a, b) => a.firstName.localeCompare(b.firstName))
  const shift = (n: number) => {
    const d = parseISODate(anchor)
    d.setMonth(d.getMonth() + n, 1)
    setAnchor(toISODate(d))
  }
  const T = today()
  return (
    <div>
      <div className="border-line flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <Button size="sm" variant="ghost" iconOnly icon={ChevronLeft} aria-label="Previous month" onClick={() => shift(-1)} />
        <p className="min-w-36 text-center text-sm font-medium">{parseISODate(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
        <Button size="sm" variant="ghost" iconOnly icon={ChevronRight} aria-label="Next month" onClick={() => shift(1)} />
        <Select
          aria-label="Department"
          className="ml-auto w-auto"
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          placeholder="All departments"
          options={db.departments.map((d) => ({ value: d.id, label: d.name }))}
        />
        <span className="text-muted flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="bg-brand-600 size-2.5 rounded-sm" /> Approved
          </span>
          <span className="flex items-center gap-1">
            <span className="border-brand-600 bg-brand-100 size-2.5 rounded-sm border" /> Pending
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-subtle size-2.5 rounded-sm" /> Non-working / holiday
          </span>
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No team members to show" compact />
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">Team leave calendar</caption>
            <thead>
              <tr>
                <th scope="col" className="bg-surface sticky left-0 z-10 min-w-44 px-4 py-2 text-left font-medium">
                  Person
                </th>
                {days.map((d) => (
                  <th key={d} scope="col" className={cn('text-muted w-7 min-w-7 px-0 py-2 text-center font-normal', d === T && 'text-brand-700 font-semibold')}>
                    {parseISODate(d).getDate()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const sched = db.schedules.find((s) => s.id === e.scheduleId)
                const hol = holidaysFor(db.holidays, e.locationId)
                const mine = leaves.filter((l) => l.employeeId === e.id)
                return (
                  <tr key={e.id} className="border-line border-t">
                    <th scope="row" className="bg-surface sticky left-0 z-10 px-4 py-1.5 text-left font-normal">
                      <span className="block truncate text-[13px]">{fullName(e)}</span>
                    </th>
                    {days.map((d) => {
                      const off = !sched?.workingDays.includes(parseISODate(d).getDay()) || hol.has(d)
                      const l = mine.find((x) => x.startDate <= d && x.endDate >= d)
                      return (
                        <td key={d} className="px-0.5 py-1.5">
                          <span
                            title={l ? `${db.leaveTypes.find((t) => t.id === l.leaveTypeId)?.name} (${l.status})` : off ? 'Non-working day' : ''}
                            className={cn(
                              'block h-5 rounded-sm',
                              l && !off ? (l.status === 'approved' ? 'bg-brand-600' : 'border-brand-600 bg-brand-100 border') : off ? 'bg-subtle' : '',
                            )}
                          />
                          {l && !off && <span className="sr-only">{`${fullName(e)} on leave ${d} (${l.status})`}</span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function LeavePage() {
  const db = useDb()
  const { account, can } = useSession()
  const [params, setParams] = useSearchParams()
  const visible = useMemo(() => visibleLeave(db, account), [db, account])
  const approvals = visible.filter((l) => l.status === 'pending' && canDecide(l.approvals, account.id))
  const team = reportIds(db.employees, account.employeeId)
  const hr = can('leave.manage')
  const tab = params.get('tab') ?? 'mine'
  const year = new Date().getFullYear()
  const mine = visible.filter((l) => l.employeeId === account.employeeId).sort((a, b) => b.startDate.localeCompare(a.startDate))
  const calendarPeople = hr ? db.employees.map((e) => e.id) : [...team, ...(account.employeeId ? [account.employeeId] : [])]

  const tabs = [
    { value: 'mine', label: 'My leave' },
    ...(approvals.length || account.role !== 'employee' ? [{ value: 'approvals', label: 'Approvals', count: approvals.length }] : []),
    ...(team.size || hr ? [{ value: 'team', label: 'Team calendar' }] : []),
    ...(hr ? [{ value: 'all', label: 'All requests', count: visible.filter((l) => l.status === 'pending').length }] : []),
  ]

  return (
    <div>
      <PageHeader
        title="Leave & Attendance"
        description="Request time off, track balances and decide on your team’s requests."
        actions={
          <LinkButton to="/leave/new" variant="primary" icon={Plus}>
            Request leave
          </LinkButton>
        }
      />
      <Tabs label="Leave views" tabs={tabs} value={tab} onChange={(v) => setParams({ tab: v })} className="mb-5" />
      {tab === 'mine' && (
        <div className="space-y-5">
          {account.employeeId ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {db.leaveTypes
                .filter((t) => t.active)
                .map((t) => {
                  const b = leaveBalance(db, account.employeeId as string, t.id, year)
                  const taken = mine
                    .filter((l) => l.leaveTypeId === t.id && l.status === 'approved' && l.startDate.startsWith(String(year)))
                    .reduce((s, l) => s + l.days, 0)
                  return (
                    <div key={t.id} className="border-line bg-surface shadow-card rounded-lg border p-4">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className="size-2.5 rounded-full" style={{ background: t.color }} aria-hidden /> {t.name}
                      </p>
                      {b ? (
                        <>
                          <p className="tabular mt-2 text-2xl font-semibold">
                            {b.available} <span className="text-muted text-sm font-normal">days left</span>
                          </p>
                          <p className="text-muted mt-1 text-xs">
                            {b.entitlement + b.adjustments} for {year} · {b.taken} taken · {b.pending} pending
                          </p>
                        </>
                      ) : (
                        <p className="text-muted mt-2 text-sm">
                          Not balance-tracked · {taken} day(s) taken in {year}
                        </p>
                      )}
                    </div>
                  )
                })}
            </div>
          ) : (
            <p className="text-muted text-sm">Your account is not linked to an employee record.</p>
          )}
          <Panel title="My requests">
            <LeaveTable rows={mine} />
          </Panel>
          <p className="text-muted text-xs">
            Balances: entitlement × FTE, pro-rated in your joining year, plus adjustments, minus approved and pending days. Holidays and non-working days are
            not deducted.
          </p>
        </div>
      )}
      {tab === 'approvals' && (
        <Panel title="Waiting for your decision">
          <LeaveTable rows={approvals} showEmployee />
        </Panel>
      )}
      {tab === 'team' && (
        <Panel title="Team calendar">
          <TeamCalendar people={calendarPeople} />
        </Panel>
      )}
      {tab === 'all' && hr && (
        <Panel title="All leave requests">
          <LeaveTable rows={[...visible].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200)} showEmployee />
        </Panel>
      )}
    </div>
  )
}
