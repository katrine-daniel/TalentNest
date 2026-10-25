import { useEffect, useRef } from 'react'

/**
 * Calls `handler` on pointer-down outside the given refs, and on Escape.
 * Escape is captured first and marked as handled so a surrounding dialog stays open.
 */
export function useClickOutside(refs, handler, enabled = true) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const refsRef = useRef(refs)
  refsRef.current = refs

  useEffect(() => {
    if (!enabled) return undefined
    const list = () => (Array.isArray(refsRef.current) ? refsRef.current : [refsRef.current])
    const onPointer = (e) => {
      if (list().some((r) => r.current && r.current.contains(e.target))) return
      handlerRef.current(e)
    }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      handlerRef.current(e)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [enabled])
}
