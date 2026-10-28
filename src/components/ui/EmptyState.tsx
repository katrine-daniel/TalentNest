import type { ComponentType, ReactNode } from 'react'
import { Inbox, type LucideProps } from 'lucide-react'
import { cn } from '@/utils/cn'

interface EmptyStateProps {
  icon?: ComponentType<LucideProps>
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}

export default function EmptyState({ icon: Icon = Inbox, title, description, action, className, compact = false }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <span className="border-line bg-subtle text-muted mb-3 flex h-10 w-10 items-center justify-center rounded-lg border">
        <Icon size={18} aria-hidden />
      </span>
      <h3 className="text-ink text-sm font-semibold">{title}</h3>
      {description && <p className="text-muted mt-1 max-w-sm text-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
