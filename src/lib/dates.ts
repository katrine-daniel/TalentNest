import type { ISODate } from '@/domain/types'

export const DAY_MS = 86_400_000

/** Today's calendar date in local time, `YYYY-MM-DD`. */
export function today(now: Date = new Date()): ISODate {
  return toISODate(now)
}

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parses `YYYY-MM-DD` as a local calendar date (not UTC). */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / DAY_MS)
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return toISODate(parseISODate(s)) === s
}

/** Every calendar date from start to end inclusive. */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

export function rangesOverlap(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate) {
  return aStart <= bEnd && bStart <= aEnd
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function formatDate(value: string | null | undefined, opts: { short?: boolean } = {}): string {
  if (!value) return '—'
  const d = value.length === 10 ? parseISODate(value) : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return (opts.short ? shortFmt : dateFmt).format(d)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : timeFmt.format(d)
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function formatRelative(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return '—'
  const t = value.length === 10 ? parseISODate(value).getTime() : new Date(value).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = t - now
  const abs = Math.abs(diff)
  if (abs < 60_000) return 'just now'
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute')
  if (abs < DAY_MS) return rtf.format(Math.round(diff / 3_600_000), 'hour')
  if (abs < 30 * DAY_MS) return rtf.format(Math.round(diff / DAY_MS), 'day')
  if (abs < 365 * DAY_MS) return rtf.format(Math.round(diff / (30 * DAY_MS)), 'month')
  return rtf.format(Math.round(diff / (365 * DAY_MS)), 'year')
}

/** Relative description for a due calendar date: "Due today", "3 days overdue", "Due in 2 days". */
export function describeDue(due: ISODate, now: ISODate = today()): { label: string; overdue: boolean; soon: boolean } {
  const d = daysBetween(now, due)
  if (d < 0) return { label: `${-d} day${d === -1 ? '' : 's'} overdue`, overdue: true, soon: false }
  if (d === 0) return { label: 'Due today', overdue: false, soon: true }
  if (d === 1) return { label: 'Due tomorrow', overdue: false, soon: true }
  return { label: `Due in ${d} days`, overdue: false, soon: d <= 3 }
}
