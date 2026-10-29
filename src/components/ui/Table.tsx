import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortable?: boolean
  className?: string
  /** Hide on small screens. */
  hideBelow?: 'sm' | 'md' | 'lg'
  align?: 'right'
}

const HIDE = { sm: 'max-sm:hidden', md: 'max-md:hidden', lg: 'max-lg:hidden' }

export interface TableProps<T> {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T) => string
  /** Each row links somewhere; the first cell should contain the link for keyboard users. */
  onRowClick?: (row: T) => void
  sort?: { key: string; dir: 'asc' | 'desc' }
  onSort?: (key: string) => void
  empty?: ReactNode
  caption: string
}

export function Table<T>({ columns, rows, rowKey, onRowClick, sort, onSort, empty, caption }: TableProps<T>) {
  if (!rows.length && empty) return <>{empty}</>
  return (
    <div className="relative scrollbar-thin overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-line border-b">
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'text-muted px-4 py-2.5 text-xs font-medium whitespace-nowrap',
                    c.hideBelow && HIDE[c.hideBelow],
                    c.align === 'right' && 'text-right',
                  )}
                >
                  {c.sortable && onSort ? (
                    <button type="button" className="hover:text-ink inline-flex items-center gap-1 rounded" onClick={() => onSort(c.key)}>
                      {c.header}
                      {active && (sort?.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('border-line border-b last:border-0', onRowClick && 'hover:bg-page cursor-pointer')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-2.5 align-middle', c.hideBelow && HIDE[c.hideBelow], c.align === 'right' && 'text-right', c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <nav aria-label="Pagination" className="border-line flex items-center justify-between gap-3 border-t px-4 py-2.5 text-sm">
      <p className="text-muted tabular">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" iconOnly icon={ChevronLeft} aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} />
        <span className="tabular px-2 text-xs">
          {page} / {pages}
        </span>
        <Button size="sm" variant="ghost" iconOnly icon={ChevronRight} aria-label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)} />
      </div>
    </nav>
  )
}
