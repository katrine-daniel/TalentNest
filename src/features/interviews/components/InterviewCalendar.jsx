import { useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { BellRing, ClipboardCheck } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { addDays, formatTime, formatWeekday, getMonthGrid, isSameDay, isToday, startOfDay, startOfWeek, formatShortDate, toInputDate } from '@/utils/formatDate'
import { EVENT_ACCENTS } from '@/utils/statusHelpers'
import { cn } from '@/utils/cn'

const START_HOUR = 8
const END_HOUR = 20
const HOUR_PX = 56

function EventChip({ event, onSelect, compact = false }) {
  const accent = EVENT_ACCENTS[event.accent]
  const cancelled = event.interview?.status === 'cancelled'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onSelect(event)
      }}
      className={cn(
        'flex w-full min-w-0 items-center gap-1 truncate rounded border-l-2 px-1.5 text-left text-[11px] leading-5 transition-opacity hover:opacity-80',
        accent.className,
        cancelled && 'line-through opacity-50',
      )}
      title={`${event.title} — ${event.candidateName}`}
    >
      {event.kind === 'assessment' ? (
        <ClipboardCheck size={10} className="shrink-0" aria-hidden />
      ) : (
        !compact && <span className="tabular shrink-0 font-medium">{formatTime(event.start).replace(':00', '')}</span>
      )}
      <span className="truncate">{event.candidateName}</span>
    </button>
  )
}

/** Assigns overlapping events to side-by-side lanes. */
function layoutDay(events) {
  const sorted = [...events].sort((a, b) => new Date(a.start) - new Date(b.start))
  const lanes = []
  const placed = sorted.map((ev) => {
    const start = new Date(ev.start).getTime()
    const end = ev.kind === 'assessment' ? start + 30 * 60_000 : new Date(ev.end).getTime()
    let lane = lanes.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) {
      lane = lanes.length
      lanes.push(end)
    } else lanes[lane] = end
    return { ev, start, end, lane }
  })
  return placed.map((p) => ({ ...p, lanes: Math.max(1, lanes.length) }))
}

function TimeGrid({ days, events, onSelectEvent, onSelectSlot }) {
  const scrollRef = useRef(null)
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

  useEffect(() => {
    const now = new Date()
    if (scrollRef.current && now.getHours() >= START_HOUR) {
      scrollRef.current.scrollTop = Math.max(0, (now.getHours() - START_HOUR - 1) * HOUR_PX)
    }
  }, [])

  const now = new Date()
  const nowOffset = ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) * (HOUR_PX / 60)

  return (
    <div>
      <div className="border-line grid border-b" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="border-line border-l px-2 py-2 text-center">
            <p className="text-xxs text-muted uppercase">{formatWeekday(d)}</p>
            <p
              className={cn(
                'tabular mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium',
                isToday(d) ? 'bg-brand-600 text-white' : 'text-ink',
              )}
            >
              {d.getDate()}
            </p>
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="max-h-[620px] scrollbar-thin overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))`, height: hours.length * HOUR_PX }}>
          <div className="relative">
            {hours.map((h) => (
              <span key={h} className="text-faint tabular absolute right-2 -translate-y-1/2 text-[10px]" style={{ top: (h - START_HOUR) * HOUR_PX }}>
                {h === START_HOUR ? '' : `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const dayEvents = events.filter((e) => isSameDay(e.start, day))
            const laidOut = layoutDay(dayEvents)
            return (
              <div key={day.toISOString()} className="border-line relative border-l">
                {hours.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onSelectSlot(toInputDate(day), `${String(h).padStart(2, '0')}:00`)}
                    className="border-line/70 hover:bg-brand-50/40 focus-visible:bg-brand-50 block w-full border-b"
                    style={{ height: HOUR_PX }}
                    aria-label={`Schedule on ${formatShortDate(day)} at ${h}:00`}
                  />
                ))}
                {isToday(day) && nowOffset > 0 && nowOffset < hours.length * HOUR_PX && (
                  <span className="pointer-events-none absolute right-0 left-0 z-10 h-px bg-red-500" style={{ top: nowOffset }} aria-hidden>
                    <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-red-500" />
                  </span>
                )}
                {laidOut.map(({ ev, start, end, lane, lanes }) => {
                  const d = new Date(start)
                  const top = ((d.getHours() - START_HOUR) * 60 + d.getMinutes()) * (HOUR_PX / 60)
                  const height = Math.max(22, ((end - start) / 60_000) * (HOUR_PX / 60) - 2)
                  if (top < 0 || top > hours.length * HOUR_PX) return null
                  const accent = EVENT_ACCENTS[ev.accent]
                  const cancelled = ev.interview?.status === 'cancelled'
                  return (
                    <motion.button
                      key={ev.id}
                      type="button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: cancelled ? 0.5 : 1 }}
                      onClick={() => onSelectEvent(ev)}
                      className={cn(
                        'hover:shadow-pop absolute z-[5] overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight shadow-xs hover:z-20',
                        accent.className,
                      )}
                      style={{ top: top + 1, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                    >
                      <span className={cn('block truncate font-medium', cancelled && 'line-through')}>{ev.candidateName}</span>
                      <span className="block truncate opacity-80">{ev.kind === 'assessment' ? 'Assessment due' : `${formatTime(ev.start)} · ${ev.title}`}</span>
                      {ev.interview?.reminderSentAt && height > 44 && <BellRing size={10} className="mt-0.5 opacity-70" aria-label="Reminder sent" />}
                    </motion.button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthView({ cursor, events, onSelectEvent, onDrillDay }) {
  const grid = getMonthGrid(cursor)
  const month = cursor.getMonth()
  return (
    <div>
      <div className="border-line grid grid-cols-7 border-b">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="text-xxs text-muted py-2 text-center font-medium uppercase">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(e.start, day)).sort((a, b) => new Date(a.start) - new Date(b.start))
          const outside = day.getMonth() !== month
          return (
            <div
              key={day.toISOString()}
              className={cn('group border-line min-h-16 border-r border-b p-1 sm:min-h-28 sm:p-1.5 [&:nth-child(7n)]:border-r-0', outside && 'bg-subtle/50')}
            >
              <button
                type="button"
                onClick={() => onDrillDay(day)}
                className={cn(
                  'tabular hover:bg-subtle mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  isToday(day) ? 'bg-brand-600 hover:bg-brand-700 font-medium text-white' : outside ? 'text-faint' : 'text-ink',
                )}
                aria-label={`View ${formatShortDate(day)}${dayEvents.length ? `, ${dayEvents.length} events` : ''}`}
              >
                {day.getDate()}
              </button>
              <div className="hidden space-y-0.5 sm:block">
                {dayEvents.slice(0, 3).map((ev) => (
                  <EventChip key={ev.id} event={ev} onSelect={onSelectEvent} />
                ))}
                {dayEvents.length > 3 && (
                  <button type="button" onClick={() => onDrillDay(day)} className="text-muted hover:text-brand-700 px-1.5 text-[11px] font-medium">
                    +{dayEvents.length - 3} more
                  </button>
                )}
              </div>
              {dayEvents.length > 0 && (
                <button type="button" onClick={() => onDrillDay(day)} className="flex flex-wrap gap-0.5 sm:hidden" aria-label={`${dayEvents.length} events`}>
                  {dayEvents.slice(0, 4).map((ev) => (
                    <span key={ev.id} className={cn('h-1.5 w-1.5 rounded-full', EVENT_ACCENTS[ev.accent].dot)} />
                  ))}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AgendaView({ days, events, onSelectEvent }) {
  const groups = days
    .map((d) => ({ day: d, items: events.filter((e) => isSameDay(e.start, d)).sort((a, b) => new Date(a.start) - new Date(b.start)) }))
    .filter((g) => g.items.length)
  if (!groups.length) return <EmptyState compact title="Nothing scheduled" description="No interviews or deadlines in this period." />
  return (
    <div className="divide-line divide-y">
      {groups.map((g) => (
        <section key={g.day.toISOString()} className="px-4 py-3">
          <h3 className={cn('mb-2 text-xs font-semibold', isToday(g.day) ? 'text-brand-700' : 'text-muted')}>
            {isToday(g.day) ? 'Today' : formatWeekday(g.day, 'long')}, {formatShortDate(g.day)}
          </h3>
          <ul className="space-y-1.5">
            {g.items.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onSelectEvent(ev)}
                  className={cn('flex w-full items-center gap-3 rounded-lg border-l-[3px] px-3 py-2 text-left', EVENT_ACCENTS[ev.accent].className)}
                >
                  <span className="tabular w-14 shrink-0 text-xs font-medium">{ev.kind === 'assessment' ? 'Due' : formatTime(ev.start)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{ev.candidateName}</span>
                    <span className="block truncate text-xs opacity-80">
                      {ev.title} · {ev.job?.title}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * Day / week / month calendar for interviews and assessment deadlines.
 * On phones the week view becomes an agenda list.
 */
export default function InterviewCalendar({ view, cursor, events, onSelectEvent, onSelectSlot, onDrillDay, isMobile }) {
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)), [cursor])

  if (view === 'month') return <MonthView cursor={cursor} events={events} onSelectEvent={onSelectEvent} onDrillDay={onDrillDay} />
  if (view === 'week') {
    if (isMobile) return <AgendaView days={weekDays} events={events} onSelectEvent={onSelectEvent} />
    return <TimeGrid days={weekDays} events={events} onSelectEvent={onSelectEvent} onSelectSlot={onSelectSlot} />
  }
  return <TimeGrid days={[startOfDay(cursor)]} events={events} onSelectEvent={onSelectEvent} onSelectSlot={onSelectSlot} />
}
