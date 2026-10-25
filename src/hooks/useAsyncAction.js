import { useCallback, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'

/**
 * Runs a service call with pending state and toast feedback.
 * Resolves to { ok, data, error } so callers never need try/catch.
 */
export function useAsyncAction(action, { success, errorTitle = 'Something went wrong' } = {}) {
  const [pending, setPending] = useState(false)
  const toast = useToast()
  const actionRef = useRef(action)
  actionRef.current = action
  const successRef = useRef(success)
  successRef.current = success

  const run = useCallback(
    async (...args) => {
      setPending(true)
      try {
        const data = await actionRef.current(...args)
        const msg = typeof successRef.current === 'function' ? successRef.current(data, ...args) : successRef.current
        if (msg) toast.success(msg)
        return { ok: true, data }
      } catch (error) {
        toast.error(error?.message || 'Please try again.', errorTitle)
        return { ok: false, error }
      } finally {
        setPending(false)
      }
    },
    [toast, errorTitle],
  )

  return { run, pending }
}
