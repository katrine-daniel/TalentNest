import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { cn } from '@/utils/cn'

/**
 * One KPI cell. Designed to sit inside MetricStrip (a single bordered strip with
 * hairline dividers) rather than as a floating card.
 */
export default function MetricCard({ label, value, detail, icon: Icon, to, emphasis = false, detailTone = 'muted' }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        {Icon && (
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', emphasis ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600')}>
            <Icon size={15} aria-hidden />
          </span>
        )}
        {to && <ArrowUpRight size={14} className="text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </div>
      <p className="mt-3 truncate text-xs text-muted">{label}</p>
      <div className={cn('mt-0.5 text-2xl font-semibold tracking-tight', emphasis ? 'text-brand-700' : 'text-ink')}>
        <AnimatedNumber value={value} />
      </div>
      {detail && <p className={cn('mt-1 truncate text-xs', detailTone === 'warn' ? 'text-amber-700' : detailTone === 'danger' ? 'text-red-600' : 'text-muted')}>{detail}</p>}
    </>
  )

  const cls = 'group block bg-surface px-4 py-4 transition-colors sm:px-5'
  if (to?.startsWith('#')) {
    return (
      <a
        href={to}
        className={cn(cls, 'hover:bg-subtle/60')}
        onClick={(e) => {
          e.preventDefault()
          document.getElementById(to.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}
      >
        {body}
      </a>
    )
  }
  return to ? (
    <Link to={to} className={cn(cls, 'hover:bg-subtle/60')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

const STRIP_COLUMNS = {
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-3 xl:grid-cols-5',
  6: 'md:grid-cols-3 xl:grid-cols-6',
}

export function MetricStrip({ children, columns = 6, className }) {
  return <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line/80 bg-line shadow-card', STRIP_COLUMNS[columns], className)}>{children}</div>
}
