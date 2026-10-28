import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ClipboardX, Clock4, FileClock, MessageSquareWarning, ScanSearch } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { formatRelative } from '@/utils/formatDate'
import { cn } from '@/utils/cn'

const KINDS = {
  feedback: { label: 'Feedback', icon: MessageSquareWarning, className: 'bg-red-50 text-red-600' },
  assessment: { label: 'Overdue tests', icon: ClipboardX, className: 'bg-amber-50 text-amber-700' },
  review: { label: 'To review', icon: ScanSearch, className: 'bg-sky-50 text-sky-700' },
  offer: { label: 'Offers', icon: FileClock, className: 'bg-teal-50 text-teal-700' },
  stale: { label: 'Stalled', icon: Clock4, className: 'bg-gray-100 text-gray-600' },
}

/** Pending feedback, overdue actions and stalled candidates, filterable by type. */
export default function AttentionList({ items, limit = 7 }) {
  const [kind, setKind] = useState('all')
  const counts = useMemo(() => items.reduce((acc, i) => ({ ...acc, [i.kind]: (acc[i.kind] ?? 0) + 1 }), {}), [items])
  const visible = kind === 'all' ? items : items.filter((i) => i.kind === kind)

  if (!items.length) {
    return <EmptyState compact icon={CheckCircle2} title="No overdue actions" description="Feedback, assessments and offers are all on track." />
  }

  return (
    <div className="pb-3">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-3" role="group" aria-label="Filter actions">
        {[
          ['all', `All ${items.length}`],
          ...Object.keys(KINDS)
            .filter((k) => counts[k])
            .map((k) => [k, `${KINDS[k].label} ${counts[k]}`]),
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={cn(
              'shrink-0 rounded-md border px-2 py-1 text-xs whitespace-nowrap transition-colors',
              kind === value ? 'border-brand-200 bg-brand-50 text-brand-700 font-medium' : 'border-line text-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="divide-line border-line divide-y border-t">
        {visible.slice(0, limit).map((item) => {
          const meta = KINDS[item.kind]
          const Icon = meta.icon
          return (
            <li key={item.id}>
              <Link to={item.link} className="hover:bg-subtle/70 flex items-center gap-3 px-5 py-2.5">
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', meta.className)}>
                  <Icon size={14} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{item.title}</span>
                  <span className="text-muted block truncate text-xs">{item.subtitle}</span>
                </span>
                <span className={cn('tabular shrink-0 text-xs', item.overdue ? 'font-medium text-red-600' : 'text-muted')}>{formatRelative(item.due)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      {visible.length > limit && <p className="text-muted px-5 pt-2.5 text-xs">+ {visible.length - limit} more</p>}
    </div>
  )
}
