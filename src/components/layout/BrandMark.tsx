import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'

export default function BrandMark({
  collapsed = false,
  onClick,
  subtitle = 'Recruitment platform',
}: {
  collapsed?: boolean
  onClick?: () => void
  subtitle?: string
}) {
  return (
    <Link to="/" onClick={onClick} className={cn('flex items-center gap-2.5 rounded-lg', collapsed && 'justify-center')} aria-label="TalentNest home">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <rect width="32" height="32" rx="8" fill="#592ca2" />
        <path d="M9 11h14M16 11v12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="23" cy="21" r="2.5" fill="#d9c9f0" />
      </svg>
      {!collapsed && (
        <span className="leading-tight">
          <span className="text-ink block text-[15px] font-semibold tracking-tight">TalentNest</span>
          <span className="text-muted block max-w-40 truncate text-[10px]">{subtitle}</span>
        </span>
      )}
    </Link>
  )
}
