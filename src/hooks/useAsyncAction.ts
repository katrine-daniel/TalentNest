import { useCallback, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'

export type ActionResult<T> = { ok: true; data: T; error?: undefined } | { ok: false; data?: undefined; error: Error }

/**
 * Runs a service call with pending state and toast feedback.
 * Resolves to `{ ok, data, error }` so callers never need try/catch.
 * While pending, callers should disable the triggering control (prevents double submits).
 */
export function useAsyncAction<A extends unknown[], T>(
  action: (...args: A) => Promise<T>,
  { success, errorTitle = 'Something went wrong' }: { success?: string | ((data: T, ...args: A) => string | null | undefined); errorTitle?: string } = {},
) {
  const [pending, setPending] = useState(false)
  const toast = useToast()
  const actionRef = useRef(action)
  actionRef.current = action
  const successRef = useRef(success)
  successRef.current = success

  const run = useCallback(
    async (...args: A): Promise<ActionResult<T>> => {
      setPending(true)
      try {
        const data = await actionRef.current(...args)
        const s = successRef.current
        const msg = typeof s === 'function' ? s(data, ...args) : s
        if (msg) toast.success(msg)
        return { ok: true, data }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        toast.error(error.message || 'Please try again.', errorTitle)
        return { ok: false, error }
      } finally {
        setPending(false)
      }
    },
    [toast, errorTitle],
  )

  return { run, pending }
}
