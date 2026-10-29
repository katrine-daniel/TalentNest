/**
 * Workforce analytics computed from stored records only.
 * Every rate returns null when its denominator is zero so the UI shows "—" rather than 0%.
 * Breakdowns of sensitive measures (leave usage) suppress groups smaller than MIN_GROUP.
 */
import { addDays, parseISODate, today } from '@/lib/dates'
import { DONE_STATUSES } from './sla'
import type { Database, Employee, ID } from './types'

export const MIN_GROUP = 3

export const DEFINITIONS: Record<string, { label: string; formula: string }> = {
  headcount: { label: 'Active headcount', formula: 'Employees with status active, on leave or offboarding on the end date of the period.' },
  joiners: { label: 'Joiners', formula: 'Employees whose joining date falls in the period.' },
  leavers: { label: 'Leavers', formula: 'Employees with an end date in the period and status offboarding or terminated.' },
  turnover: { label: 'Turnover rate', formula: 'Leavers in the period ÷ average of headcount at the start and end of the period.' },
  openRequests: { label: 'Open requests', formula: 'Service requests not resolved, closed, rejected or cancelled.' },
  overdueRequests: { label: 'Overdue requests', formula: 'Open requests past their service target (requests waiting on the employee are excluded).' },
  resolution: {
    label: 'Median resolution time',
    formula: 'Median business-agnostic hours from submission to resolution, for requests resolved in the period.',
  },
  slaMet: { label: 'Resolved within target', formula: 'Requests resolved in the period on or before their due time ÷ requests resolved in the period.' },
  approvalTurnaround: {
    label: 'Median approval turnaround',
    formula: 'Median hours from submission to the final approval decision, for leave and requests decided in the period.',
  },
  onboardingCompletion: {
    label: 'Onboarding tasks on time',
    formula: 'Onboarding tasks completed on or before their due date ÷ onboarding tasks due in the period.',
  },
  leaveUsage: { label: 'Leave taken', formula: 'Working days of approved leave starting in the period, by leave type. Groups under 3 people are hidden.' },
  ackRate: { label: 'Policy acknowledgment', formula: 'Employees who acknowledged the current version ÷ employees in the policy audience.' },
}

export interface Range {
  from: string
  to: string
  departmentId: ID | null
}

export const rate = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2
}

const inDept = (e: Employee, r: Range) => !r.departmentId || e.departmentId === r.departmentId
const employedOn = (e: Employee, date: string) => e.joinDate <= date && (!e.endDate || e.endDate >= date) && e.status !== 'pre_boarding'

export function headcountOn(db: Pick<Database, 'employees'>, date: string, r: Range): number {
  return db.employees.filter((e) => inDept(e, r) && employedOn(e, date) && !(e.status === 'terminated' && !e.endDate)).length
}

export function workforceSummary(db: Database, r: Range) {
  const employees = db.employees.filter((e) => inDept(e, r))
  const joiners = employees.filter((e) => e.joinDate >= r.from && e.joinDate <= r.to)
  const leavers = employees.filter((e) => e.endDate && e.endDate >= r.from && e.endDate <= r.to && ['offboarding', 'terminated'].includes(e.status))
  const start = headcountOn(db, r.from, r)
  const end = headcountOn(db, r.to > today() ? today() : r.to, r)
  return { start, end, joiners: joiners.length, leavers: leavers.length, turnover: rate(leavers.length, (start + end) / 2) }
}

export function headcountBy(db: Database, key: 'departmentId' | 'locationId' | 'employmentTypeId', r: Range) {
  const date = r.to > today() ? today() : r.to
  const names = (id: string) =>
    (key === 'departmentId' ? db.departments : key === 'locationId' ? db.locations : db.employmentTypes).find((x) => x.id === id)?.name ?? 'Unknown'
  const counts = new Map<string, number>()
  for (const e of db.employees.filter((x) => inDept(x, r) && employedOn(x, date))) counts.set(e[key], (counts.get(e[key]) ?? 0) + 1)
  return [...counts.entries()].map(([id, count]) => ({ id, name: names(id), count })).sort((a, b) => b.count - a.count)
}

/** Joiners and leavers per calendar month in the range. */
export function movementByMonth(db: Database, r: Range) {
  const months: Array<{ month: string; joiners: number; leavers: number }> = []
  const cursor = parseISODate(r.from)
  cursor.setDate(1)
  const end = parseISODate(r.to)
  while (cursor <= end && months.length < 36) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    const emps = db.employees.filter((e) => inDept(e, r))
    months.push({
      month: key,
      joiners: emps.filter((e) => e.joinDate.startsWith(key)).length,
      leavers: emps.filter((e) => e.endDate?.startsWith(key) && ['offboarding', 'terminated'].includes(e.status)).length,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

export function requestMetrics(db: Database, r: Range, now = Date.now()) {
  const emp = new Map(db.employees.map((e) => [e.id, e]))
  const scoped = db.requests.filter((q) => {
    const e = emp.get(q.employeeId)
    return e ? inDept(e, r) : !r.departmentId
  })
  const open = scoped.filter((q) => !DONE_STATUSES.includes(q.status))
  const overdue = open.filter((q) => q.status !== 'waiting_on_employee' && new Date(q.dueAt).getTime() < now)
  const resolved = scoped.filter(
    (q) => q.resolvedAt && q.resolvedAt.slice(0, 10) >= r.from && q.resolvedAt.slice(0, 10) <= r.to && ['resolved', 'closed'].includes(q.status),
  )
  const hours = resolved.map((q) => (new Date(q.resolvedAt as string).getTime() - new Date(q.createdAt).getTime()) / 3_600_000)
  const onTime = resolved.filter((q) => (q.resolvedAt as string) <= q.dueAt).length
  const byCategory = new Map<string, number>()
  for (const q of scoped.filter((x) => x.createdAt.slice(0, 10) >= r.from && x.createdAt.slice(0, 10) <= r.to))
    byCategory.set(q.category, (byCategory.get(q.category) ?? 0) + 1)
  return {
    open: open.length,
    overdue: overdue.length,
    resolved: resolved.length,
    medianResolutionHours: median(hours),
    slaMet: rate(onTime, resolved.length),
    byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
  }
}

export function approvalTurnaround(db: Database, r: Range) {
  const hours: number[] = []
  const collect = (created: string, steps: Array<{ decidedAt: string | null; decision: string }>) => {
    const decided = steps.filter((s) => s.decidedAt && s.decision !== 'pending')
    const last = decided[decided.length - 1]
    if (!last?.decidedAt || last.decidedAt.slice(0, 10) < r.from || last.decidedAt.slice(0, 10) > r.to) return
    if (steps.some((s) => s.decision === 'pending') && last.decision === 'approved') return
    hours.push(Math.max(0, (new Date(last.decidedAt).getTime() - new Date(created).getTime()) / 3_600_000))
  }
  const emp = new Map(db.employees.map((e) => [e.id, e]))
  for (const l of db.leaveRequests) if (emp.get(l.employeeId) && inDept(emp.get(l.employeeId) as Employee, r)) collect(l.createdAt, l.approvals)
  for (const q of db.requests) if (emp.get(q.employeeId) && inDept(emp.get(q.employeeId) as Employee, r)) collect(q.createdAt, q.approvals)
  return { decisions: hours.length, medianHours: median(hours) }
}

export function onboardingMetrics(db: Database, r: Range) {
  const emp = new Map(db.employees.map((e) => [e.id, e]))
  const tasks = db.lifecycleCases
    .filter((c) => c.kind === 'onboarding' && c.status !== 'cancelled' && emp.get(c.employeeId) && inDept(emp.get(c.employeeId) as Employee, r))
    .flatMap((c) => c.tasks.filter((t) => t.status !== 'skipped' && t.dueDate >= r.from && t.dueDate <= r.to && t.dueDate <= today()))
  const onTime = tasks.filter((t) => t.status === 'done' && t.completedAt && t.completedAt.slice(0, 10) <= t.dueDate).length
  const active = db.lifecycleCases.filter((c) => c.status === 'active' && emp.get(c.employeeId) && inDept(emp.get(c.employeeId) as Employee, r))
  return {
    due: tasks.length,
    onTime,
    rate: rate(onTime, tasks.length),
    activeOnboarding: active.filter((c) => c.kind === 'onboarding').length,
    activeOffboarding: active.filter((c) => c.kind === 'offboarding').length,
  }
}

export function leaveUsage(db: Database, r: Range) {
  const emp = new Map(db.employees.map((e) => [e.id, e]))
  const approved = db.leaveRequests.filter(
    (l) => l.status === 'approved' && l.startDate >= r.from && l.startDate <= r.to && emp.get(l.employeeId) && inDept(emp.get(l.employeeId) as Employee, r),
  )
  return db.leaveTypes.map((t) => {
    const rows = approved.filter((l) => l.leaveTypeId === t.id)
    const people = new Set(rows.map((l) => l.employeeId)).size
    const suppressed = people > 0 && people < MIN_GROUP
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      people: suppressed ? null : people,
      days: suppressed ? null : rows.reduce((s, l) => s + l.days, 0),
      suppressed,
    }
  })
}

export function defaultRange(days = 365): Range {
  const to = today()
  return { from: addDays(to, -days), to, departmentId: null }
}
