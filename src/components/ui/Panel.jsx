import { cn } from '@/utils/cn'

/**
 * Bordered content section. Used sparingly to group related content —
 * not every piece of information needs its own container.
 */
export default function Panel({ title, description, actions, children, className, bodyClassName, as: Tag = 'section', id }) {
  return (
    <Tag id={id} className={cn('min-w-0 rounded-2xl border border-line/80 bg-surface shadow-card', className)} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(!title && !actions && 'pt-1', bodyClassName)}>{children}</div>
    </Tag>
  )
}
