// Public API of DataTable.jsx (implementation is migrated to TypeScript incrementally).
import type { ReactElement, ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  render?: (row: T) => ReactNode
  sortable?: boolean
  className?: string
  headerClassName?: string
  hideBelow?: 'md' | 'lg' | 'xl'
  align?: 'left' | 'right'
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>
  rows: T[]
  getRowId?: (row: T) => string
  sort?: { key: string | null; dir: 'asc' | 'desc' }
  onSort?: (key: string) => void
  onRowClick?: (row: T) => void
  rowLabel?: (row: T) => string
  loading?: boolean
  empty?: ReactNode
  mobileCard?: (row: T) => ReactNode
  dense?: boolean
  className?: string
}

export default function DataTable<T>(props: DataTableProps<T>): ReactElement | null
export function CellActions(props: { children: ReactNode; className?: string }): ReactElement
