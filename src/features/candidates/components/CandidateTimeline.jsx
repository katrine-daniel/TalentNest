import { ArrowRight, CircleSlash, PartyPopper, RotateCcw, Send } from 'lucide-react'
import { useLookups } from '@/hooks/useStore'
import { formatDateTime } from '@/utils/formatDate'

const ICONS = { applied: Send, moved: ArrowRight, hired: PartyPopper, rejected: CircleSlash, restored: RotateCcw }

/** Stage-transition history for one application (newest first). */
export default function CandidateTimeline({ app, job }) {
  const { usersById } = useLookups()
  const stageName = (id) => job.stages.find((s) => s.id === id)?.name ?? 'Removed stage'
  const entries = [...app.history].reverse()

  return (
    <ol className="space-y-3">
      {entries.map((h) => {
        const Icon = ICONS[h.kind] ?? ArrowRight
        const by = usersById.get(h.byId)
        let text
        if (h.kind === 'applied')
          text = (
            <>
              Applied — entered <strong className="font-medium">{stageName(h.toStageId)}</strong>
            </>
          )
        else if (h.kind === 'rejected')
          text = (
            <>
              Not progressed at <strong className="font-medium">{stageName(h.toStageId)}</strong>
            </>
          )
        else if (h.kind === 'restored')
          text = (
            <>
              Restored to <strong className="font-medium">{stageName(h.toStageId)}</strong>
            </>
          )
        else
          text = (
            <>
              {stageName(h.fromStageId)} → <strong className="font-medium">{stageName(h.toStageId)}</strong>
            </>
          )
        return (
          <li key={h.id} className="flex gap-3 text-sm">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${h.kind === 'rejected' ? 'bg-red-50 text-red-600' : h.kind === 'hired' ? 'bg-emerald-50 text-emerald-600' : 'bg-subtle text-muted'}`}
            >
              <Icon size={12} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-ink">{text}</p>
              {h.note && <p className="text-ink-soft mt-0.5 text-xs">“{h.note}”</p>}
              <p className="text-muted mt-0.5 text-xs">
                {formatDateTime(h.at)}
                {by ? ` · ${by.name}` : ''}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
