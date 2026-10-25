import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Keeps filter state in the URL so filtered views can be linked and survive refresh.
 * Values equal to their default are removed from the query string.
 */
export function useUrlFilters(defaults) {
  const [params, setParams] = useSearchParams()

  const filters = useMemo(() => {
    const out = { ...defaults }
    Object.keys(defaults).forEach((key) => {
      const v = params.get(key)
      if (v !== null) out[key] = v
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const setFilter = useCallback(
    (key, value) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === '' || value == null || value === defaults[key]) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  )

  const reset = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        Object.keys(defaults).forEach((k) => next.delete(k))
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setParams])

  const activeCount = Object.keys(defaults).filter((k) => k !== 'q' && filters[k] !== defaults[k]).length

  return { filters, setFilter, reset, activeCount }
}
