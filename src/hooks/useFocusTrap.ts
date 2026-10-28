import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Stack of open dialogs so only the top-most one reacts to Escape/Tab.
const stack: object[] = []

/**
 * Traps keyboard focus inside a dialog while open, closes on Escape,
 * locks body scroll and restores focus to the trigger on close.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose?: () => void) {
  const containerRef = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const focusFirst = () => {
      const node = containerRef.current
      if (!node) return
      const preferred = node.querySelector<HTMLElement>('[data-autofocus]')
      const first = preferred ?? node.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? node).focus({ preventScroll: true })
    }
    // A timeout (not rAF) so focus moves even when the tab is in the background.
    const timer = window.setTimeout(focusFirst, 0)
    const token = {}
    stack.push(token)

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return
      if (e.key === 'Escape') {
        // Let open dropdowns inside the dialog handle Escape first.
        if (e.defaultPrevented) return
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !containerRef.current) return
      const items = [...containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(token), 1)
      if (!stack.length) document.body.style.overflow = overflow
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true })
    }
  }, [open])

  return containerRef
}
