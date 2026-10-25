import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Sorting + pagination state shared by every list in the app.
 * `getValue(row, key)` lets callers sort on derived values.
 */
export function useTableState(rows, { initialSort = { key: null, dir: 'asc' }, pageSize = 10, getValue } = {}) {
  const [sort, setSort] = useState(initialSort)
  const [page, setPage] = useState(1)

  const toggleSort = useCallback((key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }, [])

  const sorted = useMemo(() => {
    if (!sort.key) return rows
    const read = getValue ?? ((row, key) => row[key])
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = read(a, sort.key)
      const y = read(b, sort.key)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir
    })
  }, [rows, sort, getValue])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))

  // Clamp the page when filters shrink the result set.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pageRows = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize])

  return { sort, setSort, toggleSort, page, setPage, pageCount, pageSize, total: sorted.length, rows: pageRows, sortedRows: sorted }
}
