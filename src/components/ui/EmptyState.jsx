import { Inbox } from 'lucide-react'
import { cn } from '@/utils/cn'

export default function EmptyState({ icon: Icon = Inbox, title, description, action, className, compact = false }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-subtle text-muted">
        <Icon size={18} aria-hidden />
      </span>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
