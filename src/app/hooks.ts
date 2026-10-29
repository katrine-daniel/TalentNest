import { useCallback, useState, useSyncExternalStore } from 'react'
import { store, ServiceError } from '@/services/store'
import type { Database } from '@/domain/types'
import { useToast } from '@/components/ui/Toast'

/** The organization's data; components re-render when it changes. Only used under RequireAuth. */
export function useDb(): Database {
  const db = useSyncExternalStore(store.subscribe, () => store.getState().db)
  if (!db) throw new Error('useDb used before data loaded')
  return db
}

export function useStoreStatus() {
  return useSyncExternalStore(store.subscribe, store.getState)
}

/**
 * Wraps a service call: shows a toast on success or error and exposes `pending`.
 * Returns `{ ok: true, value }` or `{ ok: false }` so callers can close dialogs only on success.
 */
export function useAction<A extends unknown[], R>(fn: (...args: A) => R | Promise<R>, success?: string | ((r: R) => string)) {
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const run = useCallback(
    async (...args: A): Promise<{ ok: true; value: R } | { ok: false; error: string }> => {
      setPending(true)
      try {
        const value = await fn(...args)
        if (success) toast.success(typeof success === 'function' ? success(value) : success)
        return { ok: true, value }
      } catch (error) {
        const message = error instanceof ServiceError ? error.message : 'Something went wrong. Please try again.'
        if (!(error instanceof ServiceError)) console.error(error)
        toast.error(message)
        return { ok: false, error: message }
      } finally {
        setPending(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, toast],
  )
  return { run, pending }
}
