import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button'

export default function Pagination({ page, pageCount, total, pageSize, onChange, label = 'results' }) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="border-line text-muted flex items-center justify-between gap-3 border-t px-4 py-3 text-xs" aria-label="Pagination">
      <span className="tabular">
        {from}–{to} of {total} {label}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" iconOnly icon={ChevronLeft} aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} />
        <span className="tabular px-2" aria-current="page">
          {page} / {pageCount}
        </span>
        <Button size="sm" variant="ghost" iconOnly icon={ChevronRight} aria-label="Next page" disabled={page >= pageCount} onClick={() => onChange(page + 1)} />
      </div>
    </nav>
  )
}
