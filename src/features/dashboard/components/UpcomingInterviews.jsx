import { Link } from 'react-router-dom'
import { CalendarCheck2, ClipboardCheck, MapPin, Phone, Video } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { AvatarStack } from '@/components/ui/Avatar'
import { useLookups, fullName } from '@/hooks/useStore'
import { formatTime, formatWeekday, formatShortDate, isToday, isSameDay, addDays, startOfDay } from '@/utils/formatDate'
import { EVENT_ACCENTS, interviewAccent } from '@/utils/statusHelpers'
import { cn } from '@/utils/cn'

const MODE_ICONS = { Video, Phone, 'In person': MapPin }

function dayLabel(date) {
  if (isToday(date)) return 'Today'
  if (isSameDay(date, addDays(new Date(), 1))) return 'Tomorrow'
  return `${formatWeekday(date, 'long')}, ${formatShortDate(date)}`
}

/** Agenda of interviews and assessment deadlines grouped by day. */
export default function UpcomingInterviews({ items, limit = 8 }) {
  const { candidatesById, jobsById, usersById, templatesById } = useLookups()
  if (!items.length) {
    return <EmptyState compact icon={CalendarCheck2} title="Nothing scheduled" description="Interviews and assessment deadlines for the coming week will appear here." />
  }

  const groups = []
  items.slice(0, limit).forEach((entry) => {
    const day = startOfDay(entry.at).getTime()
    const g = groups.find((x) => x.day === day)
    if (g) g.entries.push(entry)
    else groups.push({ day, entries: [entry] })
  })

  return (
    <div className="space-y-4 px-5 pb-4">
      {groups.map((group) => (
        <section key={group.day} aria-label={dayLabel(group.day)}>
          <h3 className="mb-1.5 text-xxs font-semibold tracking-wide text-muted uppercase">{dayLabel(group.day)}</h3>
          <ul className="space-y-1">
            {group.entries.map(({ kind, id, at, item }) => {
              const candidate = candidatesById.get(item.candidateId)
              const job = jobsById.get(item.jobId)
              const isInterview = kind === 'interview'
              const accent = EVENT_ACCENTS[isInterview ? interviewAccent(item.stageName) : 'assessment']
              const ModeIcon = isInterview ? MODE_ICONS[item.mode] ?? Video : ClipboardCheck
              return (
                <li key={id}>
                  <Link
                    to={isInterview ? `/calendar?event=${id}` : '/assessments?status=pending'}
                    className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-subtle"
                  >
                    <span className="w-14 shrink-0 text-xs font-medium text-ink tabular">{isInterview ? formatTime(at) : 'Due'}</span>
                    <span className={cn('h-8 w-0.5 shrink-0 rounded-full', accent.dot)} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{fullName(candidate)}</span>
                      <span className="flex items-center gap-1.5 truncate text-xs text-muted">
                        <ModeIcon size={12} className="shrink-0" aria-hidden />
                        <span className="truncate">
                          {isInterview ? item.stageName : templatesById.get(item.templateId)?.name} · {job?.title}
                        </span>
                      </span>
                    </span>
                    {isInterview && <AvatarStack names={item.interviewerIds.map((uid) => usersById.get(uid)?.name).filter(Boolean)} />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {items.length > limit && (
        <Link to="/calendar" className="block text-center text-xs font-medium text-brand-600 hover:underline">
          View {items.length - limit} more in calendar
        </Link>
      )}
    </div>
  )
}
