import { useRef, type ComponentType, type KeyboardEvent, type ReactNode } from 'react'
import { Inbox, type LucideProps } from 'lucide-react'
import { cn, initials } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-ink text-[22px] leading-tight font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted mt-1 max-w-3xl text-sm">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Bordered section with an optional header row. */
export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  id?: string
}) {
  return (
    <section id={id} className={cn('border-line bg-surface shadow-card min-w-0 rounded-lg border', className)}>
      {(title || actions) && (
        <div className="border-line flex items-center gap-3 border-b px-4 py-3">
          {title && <h2 className="text-ink flex-1 text-sm font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact,
}: {
  icon?: ComponentType<LucideProps>
  title: string
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 text-center', compact ? 'py-8' : 'py-14')}>
      <div className="bg-subtle text-muted mb-3 grid size-10 place-items-center rounded-full">
        <Icon size={19} aria-hidden />
      </div>
      <p className="text-ink text-sm font-medium">{title}</p>
      {description && <p className="text-muted mt-1 max-w-sm text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('bg-subtle animate-pulse rounded', className)} aria-hidden />
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}

export function Avatar({ name, size = 'sm', className }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const palette = [
    'bg-brand-100 text-brand-700',
    'bg-emerald-100 text-emerald-800',
    'bg-amber-100 text-amber-800',
    'bg-sky-100 text-sky-800',
    'bg-rose-100 text-rose-800',
    'bg-violet-100 text-violet-800',
  ]
  const color = palette[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % palette.length]
  const sizes = { xs: 'size-6 text-[10px]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg' }
  return (
    <span className={cn('inline-grid shrink-0 place-items-center rounded-full font-semibold', sizes[size], color, className)} aria-hidden>
      {initials(name)}
    </span>
  )
}

export interface TabItem {
  value: string
  label: ReactNode
  count?: number
}

/** Accessible tab list (arrow keys move between tabs). The caller renders the active panel. */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: TabItem[]
  value: string
  onChange: (v: string) => void
  label: string
  className?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (i + delta + tabs.length) % tabs.length
    refs.current[next]?.focus()
    onChange((tabs[next] as TabItem).value)
  }
  return (
    <div role="tablist" aria-label={label} className={cn('border-line flex scrollbar-thin gap-1 overflow-x-auto border-b', className)}>
      {tabs.map((t, i) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(t.value)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
              active ? 'border-brand-600 text-ink font-medium' : 'text-muted hover:text-ink border-transparent',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('tabular rounded px-1.5 text-xs', active ? 'bg-brand-50 text-brand-700' : 'bg-subtle text-muted')}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function KeyValue({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-muted text-xs">{k}</dt>
          <dd className="text-ink mt-0.5 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A small stat used sparingly for counts that link to work. */
export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'default' }) {
  return (
    <div className="min-w-0">
      <p className="text-muted text-xs">{label}</p>
      <p className={cn('tabular mt-1 text-2xl font-semibold tracking-tight', tone === 'danger' ? 'text-danger' : 'text-ink')}>{value}</p>
      {hint && <p className="text-muted mt-0.5 text-xs">{hint}</p>}
    </div>
  )
}
