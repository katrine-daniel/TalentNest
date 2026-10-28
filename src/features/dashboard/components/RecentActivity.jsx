import { Link } from 'react-router-dom'
import {
  ArrowRightLeft,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardCheck,
  FileSignature,
  MessageSquareText,
  StickyNote,
  UserPlus,
  UserRoundPen,
} from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { useLookups } from '@/hooks/useStore'
import { formatRelative } from '@/utils/formatDate'

export const ACTIVITY_ICONS = {
  application: UserPlus,
  stage: ArrowRightLeft,
  interview: CalendarClock,
  feedback: MessageSquareText,
  assessment: ClipboardCheck,
  offer: FileSignature,
  note: StickyNote,
  candidate: UserRoundPen,
  job: BriefcaseBusiness,
}

/** Compact activity timeline used on the dashboard, candidate and job pages. */
export default function RecentActivity({ items, limit = 8, linkCandidates = true, emptyText = 'Activity from your team will show up here.' }) {
  const { usersById } = useLookups()
  if (!items.length) return <EmptyState compact title="No activity yet" description={emptyText} />
  return (
    <ol className="relative px-5 pb-4">
      {items.slice(0, limit).map((a, i) => {
        const Icon = ACTIVITY_ICONS[a.type] ?? ArrowRightLeft
        const actor = usersById.get(a.actorId)
        const last = i === Math.min(limit, items.length) - 1
        const text = <span className="text-ink text-sm leading-snug">{a.text}</span>
        return (
          <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span className="bg-line absolute top-7 bottom-0 left-[13px] w-px" aria-hidden />}
            <span className="border-line bg-surface text-muted relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border">
              <Icon size={13} aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              {linkCandidates && a.candidateId ? (
                <Link to={`/candidates/${a.candidateId}`} className="hover:underline">
                  {text}
                </Link>
              ) : (
                text
              )}
              <p className="text-muted mt-0.5 text-xs">
                {actor ? `${actor.name} · ` : ''}
                {formatRelative(a.at)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
