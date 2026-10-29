/**
 * Leave rules.
 *
 * Working days: a day counts when it is one of the employee's schedule working days and is not a
 * holiday for their location (or an organization-wide holiday). Half days subtract 0.5 at the
 * start and/or end.
 *
 * Balance for a leave type and calendar year (tracked types only):
 *   entitlement  = annualDays × FTE, pro-rated by months employed in the year when joining mid-year
 *   adjustments  = sum of manual adjustments / carry-over for that year
 *   taken        = approved leave days in the year
 *   pending      = days in pending or changes-requested requests in the year
 *   available    = entitlement + adjustments − taken − pending
 * Requests that span two years count each day in the year it falls in.
 */
import { addDays, eachDay, isValidISODate, parseISODate, rangesOverlap } from '@/lib/dates'
import type { Database, Employee, Holiday, ID, ISODate, LeaveRequest, LeaveType, WorkSchedule } from './types'

export function holidaysFor(holidays: readonly Holiday[], locationId: ID): Set<ISODate> {
  return new Set(holidays.filter((h) => h.locationId === null || h.locationId === locationId).map((h) => h.date))
}

export function workingDayList(start: ISODate, end: ISODate, schedule: Pick<WorkSchedule, 'workingDays'>, holidays: Set<ISODate>): ISODate[] {
  if (end < start) return []
  return eachDay(start, end).filter((d) => schedule.workingDays.includes(parseISODate(d).getDay()) && !holidays.has(d))
}

export function countLeaveDays(
  req: Pick<LeaveRequest, 'startDate' | 'endDate' | 'halfDayStart' | 'halfDayEnd'>,
  schedule: Pick<WorkSchedule, 'workingDays'>,
  holidays: Set<ISODate>,
): number {
  const days = workingDayList(req.startDate, req.endDate, schedule, holidays)
  if (!days.length) return 0
  let total = days.length
  if (req.halfDayStart && days[0] === req.startDate) total -= 0.5
  if (req.halfDayEnd && days[days.length - 1] === req.endDate && !(req.startDate === req.endDate && req.halfDayStart)) total -= 0.5
  return Math.max(total, 0)
}

/** Days of a request that fall within `year` (requests can cross a year boundary). */
export function daysInYear(req: LeaveRequest, year: number, schedule: Pick<WorkSchedule, 'workingDays'>, holidays: Set<ISODate>): number {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  if (!rangesOverlap(req.startDate, req.endDate, from, to)) return 0
  if (req.startDate >= from && req.endDate <= to) return req.days
  const start = req.startDate < from ? from : req.startDate
  const end = req.endDate > to ? to : req.endDate
  return countLeaveDays({ startDate: start, endDate: end, halfDayStart: req.halfDayStart && start === req.startDate, halfDayEnd: req.halfDayEnd && end === req.endDate }, schedule, holidays)
}

export function entitlement(type: LeaveType, employee: Pick<Employee, 'joinDate' | 'employmentTypeId'>, fte: number, year: number): number {
  if (!type.tracked) return 0
  const joined = parseISODate(employee.joinDate)
  let months = 12
  if (joined.getFullYear() === year) months = 12 - joined.getMonth()
  else if (joined.getFullYear() > year) months = 0
  // Round to the nearest half day.
  return Math.round(type.annualDays * fte * (months / 12) * 2) / 2
}

export interface LeaveBalance {
  leaveTypeId: ID
  year: number
  entitlement: number
  adjustments: number
  taken: number
  pending: number
  available: number
}

export function leaveBalance(db: Pick<Database, 'employees' | 'leaveTypes' | 'leaveRequests' | 'leaveAdjustments' | 'schedules' | 'holidays' | 'employmentTypes'>, employeeId: ID, leaveTypeId: ID, year: number): LeaveBalance | null {
  const employee = db.employees.find((e) => e.id === employeeId)
  const type = db.leaveTypes.find((t) => t.id === leaveTypeId)
  if (!employee || !type || !type.tracked) return null
  const schedule = db.schedules.find((s) => s.id === employee.scheduleId) ?? { workingDays: [1, 2, 3, 4, 5] }
  const fte = db.employmentTypes.find((t) => t.id === employee.employmentTypeId)?.fte ?? 1
  const hol = holidaysFor(db.holidays, employee.locationId)
  const mine = db.leaveRequests.filter((r) => r.employeeId === employeeId && r.leaveTypeId === leaveTypeId)
  const sum = (statuses: LeaveRequest['status'][]) => mine.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + daysInYear(r, year, schedule, hol), 0)
  const ent = entitlement(type, employee, fte, year)
  const adjustments = db.leaveAdjustments.filter((a) => a.employeeId === employeeId && a.leaveTypeId === leaveTypeId && a.year === year).reduce((s, a) => s + a.days, 0)
  const taken = sum(['approved'])
  const pending = sum(['pending', 'changes_requested'])
  return { leaveTypeId, year, entitlement: ent, adjustments, taken, pending, available: ent + adjustments - taken - pending }
}

export interface LeaveValidation {
  days: number
  errors: string[]
  warnings: string[]
}

/** Validates a new or edited leave request against dates, overlaps and balance. */
export function validateLeave(
  db: Pick<Database, 'employees' | 'leaveTypes' | 'leaveRequests' | 'leaveAdjustments' | 'schedules' | 'holidays' | 'employmentTypes'>,
  input: Pick<LeaveRequest, 'employeeId' | 'leaveTypeId' | 'startDate' | 'endDate' | 'halfDayStart' | 'halfDayEnd'>,
  excludeId?: ID,
): LeaveValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const employee = db.employees.find((e) => e.id === input.employeeId)
  const type = db.leaveTypes.find((t) => t.id === input.leaveTypeId)
  if (!employee) errors.push('Employee not found.')
  if (!type || !type.active) errors.push('Choose an available leave type.')
  if (!input.startDate || !input.endDate) errors.push('Choose start and end dates.')
  else if (!isValidISODate(input.startDate) || !isValidISODate(input.endDate)) errors.push('Enter valid start and end dates.')
  else if (input.endDate < input.startDate) errors.push('The end date is before the start date.')
  if (errors.length || !employee || !type) return { days: 0, errors, warnings }

  const schedule = db.schedules.find((s) => s.id === employee.scheduleId) ?? { workingDays: [1, 2, 3, 4, 5] }
  const days = countLeaveDays(input, schedule, holidaysFor(db.holidays, employee.locationId))
  if (days === 0) errors.push('The selected dates contain no working days for this schedule.')

  const overlapping = db.leaveRequests.filter(
    (r) => r.employeeId === input.employeeId && r.id !== excludeId && ['pending', 'approved', 'changes_requested'].includes(r.status) && rangesOverlap(r.startDate, r.endDate, input.startDate, input.endDate),
  )
  if (overlapping.length) errors.push(`These dates overlap ${overlapping.length === 1 ? 'another request' : `${overlapping.length} other requests`} (${overlapping.map((r) => `${r.startDate} – ${r.endDate}`).join(', ')}).`)

  if (type.tracked && days > 0) {
    const years = new Set([parseISODate(input.startDate).getFullYear(), parseISODate(input.endDate).getFullYear()])
    for (const year of years) {
      const bal = leaveBalance(db, input.employeeId, input.leaveTypeId, year)
      const asRequest = { ...input, id: 'new', days, reason: '', status: 'pending', approvals: [], timeline: [], requestedBy: '', createdAt: '', updatedAt: '' } as LeaveRequest
      const needed = daysInYear(asRequest, year, schedule, holidaysFor(db.holidays, employee.locationId))
      const previous = excludeId ? db.leaveRequests.find((r) => r.id === excludeId) : undefined
      const credit = previous && ['pending', 'changes_requested'].includes(previous.status) ? daysInYear(previous, year, schedule, holidaysFor(db.holidays, employee.locationId)) : 0
      if (bal && bal.available + credit - needed < 0 && !type.allowNegative) {
        errors.push(`Not enough ${type.name.toLowerCase()} in ${year}: ${bal.available + credit} day(s) available, ${needed} requested.`)
      }
    }
  }
  if (type.requiresAttachmentAfterDays !== null && days > type.requiresAttachmentAfterDays) {
    warnings.push(`${type.name} longer than ${type.requiresAttachmentAfterDays} day(s) needs a supporting document — HR may ask for one.`)
  }
  return { days, errors, warnings }
}

/** End date that covers `workingDays` working days from `start` (used by the seed and quick picks). */
export function endDateFor(start: ISODate, workingDays: number, schedule: Pick<WorkSchedule, 'workingDays'>, holidays: Set<ISODate>): ISODate {
  let d = start
  let counted = 0
  for (let guard = 0; guard < 366; guard++) {
    if (schedule.workingDays.includes(parseISODate(d).getDay()) && !holidays.has(d)) counted++
    if (counted >= workingDays) return d
    d = addDays(d, 1)
  }
  return d
}
