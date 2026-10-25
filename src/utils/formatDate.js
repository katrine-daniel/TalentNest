const DAY = 86_400_000

const toDate = (value) => (value instanceof Date ? value : new Date(value))

export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return '—'
  return toDate(value).toLocaleDateString('en-GB', options)
}

export function formatShortDate(value) {
  return formatDate(value, { day: 'numeric', month: 'short' })
}

export function formatTime(value) {
  if (!value) return ''
  return toDate(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function formatDateTime(value) {
  if (!value) return '—'
  return `${formatDate(value, { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTime(value)}`
}

export function formatWeekday(value, style = 'short') {
  return toDate(value).toLocaleDateString('en-GB', { weekday: style })
}

export function formatMonthYear(value) {
  return toDate(value).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

/** "3h ago", "in 2 days", "Yesterday" */
export function formatRelative(value, now = new Date()) {
  if (!value) return '—'
  const diff = toDate(value).getTime() - now.getTime()
  const abs = Math.abs(diff)
  const future = diff > 0
  const fmt = (n, unit) => (future ? `in ${n}${unit}` : `${n}${unit} ago`)
  if (abs < 60_000) return future ? 'in a moment' : 'just now'
  if (abs < 3_600_000) return fmt(Math.round(abs / 60_000), 'm')
  if (abs < DAY) return fmt(Math.round(abs / 3_600_000), 'h')
  const days = Math.round(abs / DAY)
  if (days === 1) return future ? 'Tomorrow' : 'Yesterday'
  if (days < 30) return fmt(days, 'd')
  return formatDate(value)
}

export function startOfDay(value) {
  const d = new Date(toDate(value))
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(value, n) {
  const d = new Date(toDate(value))
  d.setDate(d.getDate() + n)
  return d
}

export function addMonths(value, n) {
  const d = new Date(toDate(value))
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  return d
}

/** Weeks start on Monday. */
export function startOfWeek(value) {
  const d = startOfDay(value)
  const day = (d.getDay() + 6) % 7
  return addDays(d, -day)
}

export function startOfMonth(value) {
  const d = startOfDay(value)
  d.setDate(1)
  return d
}

export function isSameDay(a, b) {
  const x = toDate(a)
  const y = toDate(b)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
}

export function isToday(value) {
  return isSameDay(value, new Date())
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY)
}

/** 6x7 grid of dates for a month view, starting Monday. */
export function getMonthGrid(value) {
  const first = startOfWeek(startOfMonth(value))
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

export function toInputDate(value) {
  const d = toDate(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function toInputTime(value) {
  const d = toDate(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function combineDateTime(dateStr, timeStr = '09:00') {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm).toISOString()
}

export function greeting(now = new Date()) {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
