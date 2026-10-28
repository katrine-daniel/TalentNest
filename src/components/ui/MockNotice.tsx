import type { ReactNode } from 'react'
import { FlaskConical } from 'lucide-react'
import { cn } from '@/utils/cn'

/** Clearly labels features that run in demo mode rather than through a real integration. */
export default function MockNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'border-line-strong bg-subtle/60 text-muted flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed',
        className,
      )}
    >
      <FlaskConical size={14} className="text-faint mt-px shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
