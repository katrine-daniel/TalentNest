/** Builds an RFC 5545 calendar event (.ics) that any calendar app can import. */
const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
// Escape per RFC 5545 §3.3.11 and strip line breaks that could inject properties.
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export function buildIcs({
  uid,
  title,
  start,
  durationMin,
  location,
  description,
}: {
  uid: string
  title: string
  start: string
  durationMin: number
  location?: string
  description?: string
}) {
  const begin = new Date(start)
  const end = new Date(begin.getTime() + durationMin * 60_000)
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TalentNest//Interviews//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${text(uid)}@talentnest`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(begin)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(title)}`,
    location ? `LOCATION:${text(location)}` : '',
    description ? `DESCRIPTION:${text(description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

export function downloadIcs(filename: string, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
