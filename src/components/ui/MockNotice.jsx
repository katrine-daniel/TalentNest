import { FlaskConical } from 'lucide-react'
import { cn } from '@/utils/cn'

/** Clearly labels features that run on the demo/mock layer rather than a real integration. */
export default function MockNotice({ children, className }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-lg border border-dashed border-line-strong bg-subtle/60 px-3 py-2 text-xs leading-relaxed text-muted', className)}>
      <FlaskConical size={14} className="mt-px shrink-0 text-faint" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
