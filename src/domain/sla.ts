/**
 * Service levels: SLA targets are business hours, counted Monday–Friday, 09:00–17:00 local time
 * (8 hours per day). Holidays are not excluded from SLA clocks.
 */
import type { HRRequest, RequestStatus } from './types'

const START_HOUR = 9
const HOURS_PER_DAY = 8

export function addBusinessHours(from: Date, hours: number): Date {
  const d = new Date(from)
  let remaining = hours * 60
  // Snap into working time.
  const snap = () => {
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1)
      d.setHours(START_HOUR, 0, 0, 0)
    }
    if (d.getHours() < START_HOUR) d.setHours(START_HOUR, 0, 0, 0)
    if (d.getHours() >= START_HOUR + HOURS_PER_DAY) {
      d.setDate(d.getDate() + 1)
      d.setHours(START_HOUR, 0, 0, 0)
      snap()
    }
  }
  snap()
  while (remaining > 0) {
    const endOfDay = new Date(d)
    endOfDay.setHours(START_HOUR + HOURS_PER_DAY, 0, 0, 0)
    const available = (endOfDay.getTime() - d.getTime()) / 60_000
    if (remaining <= available) {
      d.setTime(d.getTime() + remaining * 60_000)
      remaining = 0
    } else {
      remaining -= available
      d.setDate(d.getDate() + 1)
      d.setHours(START_HOUR, 0, 0, 0)
      snap()
    }
  }
  return d
}

export const OPEN_STATUSES: RequestStatus[] = ['open', 'in_progress', 'waiting_on_employee', 'pending_approval', 'changes_requested', 'approved']
export const DONE_STATUSES: RequestStatus[] = ['resolved', 'closed', 'rejected', 'cancelled']

export const isOpenRequest = (r: Pick<HRRequest, 'status'>) => OPEN_STATUSES.includes(r.status)

/** Overdue: still open and past due. Requests waiting on the employee pause the SLA. */
export function isOverdue(r: Pick<HRRequest, 'status' | 'dueAt'>, now = Date.now()): boolean {
  return isOpenRequest(r) && r.status !== 'waiting_on_employee' && new Date(r.dueAt).getTime() < now
}
