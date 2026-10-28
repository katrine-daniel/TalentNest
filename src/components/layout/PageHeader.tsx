import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/** Consistent page title row with optional meta line and actions. */
export default function PageHeader({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:mb-6', className)}>
      <div className="min-w-0">
        <h1 className="text-ink text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted mt-0.5 text-sm">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
