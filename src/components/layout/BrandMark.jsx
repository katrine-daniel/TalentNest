import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'

export default function BrandMark({ collapsed = false, onClick }) {
  return (
    <Link to="/" onClick={onClick} className={cn('flex items-center gap-2.5 rounded-lg', collapsed && 'justify-center')} aria-label="TalentNest home">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <rect width="32" height="32" rx="8" fill="#592ca2" />
        <path d="M9 11h14M16 11v12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="23" cy="21" r="2.5" fill="#d9c9f0" />
      </svg>
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight text-ink">TalentNest</span>
          <span className="block text-[10px] text-muted">Skyline Voyages Group</span>
        </span>
      )}
    </Link>
  )
}
