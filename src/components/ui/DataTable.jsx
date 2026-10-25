import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { TableSkeleton } from './LoadingState'

/**
 * Generic data table.
 * - columns: [{ key, header, render?, sortable?, className?, hideBelow?: 'md'|'lg'|'xl', align? }]
 * - `mobileCard(row)` switches to a stacked card list below the md breakpoint.
 */
export default function DataTable({
  columns,
  rows,
  getRowId = (r) => r.id,
  sort,
  onSort,
  onRowClick,
  rowLabel,
  loading = false,
  empty,
  mobileCard,
  dense = false,
  className,
}) {
  if (loading) return <TableSkeleton columns={Math.min(columns.length, 5)} />
  if (!rows.length) return empty ?? null

  const hide = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' }

  return (
    <>
      {mobileCard && (
        <ul className="divide-y divide-line md:hidden">
          {rows.map((row) => (
            <li key={getRowId(row)}>
              {onRowClick ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={rowLabel?.(row)}
                  onClick={() => onRowClick(row)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      onRowClick(row)
                    }
                  }}
                  className="block w-full px-4 py-3.5 text-left transition-colors active:bg-subtle"
                >
                  {mobileCard(row)}
                </div>
              ) : (
                <div className="px-4 py-3.5">{mobileCard(row)}</div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className={cn('overflow-x-auto scrollbar-thin', mobileCard && 'hidden md:block', className)}>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              {columns.map((col) => {
                const sorted = sort?.key === col.key
                const ariaSort = sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn(
                      'px-4 py-2.5 text-xxs font-medium tracking-wide whitespace-nowrap text-muted uppercase first:pl-5 last:pr-5',
                      col.align === 'right' && 'text-right',
                      col.hideBelow && hide[col.hideBelow],
                      col.headerClassName,
                    )}
                  >
                    {col.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(col.key)}
                        className={cn('-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase hover:text-ink', sorted && 'text-ink')}
                      >
                        {col.header}
                        {sorted ? sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ChevronsUpDown size={12} className="opacity-50" />}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.target === e.currentTarget && e.key === 'Enter') onRowClick(row)
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick ? rowLabel?.(row) : undefined}
                className={cn('group transition-colors', onRowClick && 'cursor-pointer hover:bg-subtle/70 focus-visible:bg-subtle')}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 align-middle first:pl-5 last:pr-5',
                      dense ? 'py-2' : 'py-3',
                      col.align === 'right' && 'text-right',
                      col.hideBelow && hide[col.hideBelow],
                      col.className,
                    )}
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Stops row click handlers when interacting with controls inside a cell. */
export function CellActions({ children, className }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={cn('flex items-center justify-end gap-1', className)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  )
}
