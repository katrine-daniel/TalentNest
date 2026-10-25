import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useClickOutside } from '@/hooks/useClickOutside'

/**
 * Menu / popover anchored to a trigger.
 *
 * - `renderTrigger(props)` must spread `props` onto a button (ref, aria and click handlers included).
 * - Pass `items` for an accessible action menu (arrow-key navigation), or
 *   `children(close)` for custom popover content.
 */
export default function Dropdown({ renderTrigger, items, children, align = 'end', side = 'bottom', className, menuLabel = 'Menu' }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const id = useId()

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    setActive(-1)
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
  }, [])

  useClickOutside([triggerRef, panelRef], () => close(false), open)

  const enabledIdx = (items ?? []).map((it, i) => (!it.divider && !it.disabled && !it.heading ? i : -1)).filter((i) => i >= 0)

  useEffect(() => {
    if (open && items) {
      const node = panelRef.current?.querySelector(`[data-idx="${active}"]`)
      node?.focus({ preventScroll: true })
    }
  }, [active, open, items])

  const openMenu = (focusFirst = false) => {
    setOpen(true)
    if (items && focusFirst) setActive(enabledIdx[0] ?? -1)
  }

  const onTriggerKey = (e) => {
    if (!items) return
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMenu(true)
    }
  }

  const onMenuKey = (e) => {
    if (!items) return
    const pos = enabledIdx.indexOf(active)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(enabledIdx[(pos + 1) % enabledIdx.length])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(enabledIdx[(pos - 1 + enabledIdx.length) % enabledIdx.length])
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(enabledIdx[0])
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(enabledIdx[enabledIdx.length - 1])
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  const triggerProps = {
    ref: triggerRef,
    onClick: () => (open ? close(false) : openMenu(false)),
    onKeyDown: onTriggerKey,
    'aria-haspopup': items ? 'menu' : 'dialog',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
  }

  return (
    <div className="relative inline-flex">
      {renderTrigger(triggerProps, open)}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={id}
            role={items ? 'menu' : 'dialog'}
            aria-label={menuLabel}
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: side === 'bottom' ? -4 : 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === 'bottom' ? -4 : 4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className={cn(
              'absolute z-40 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-pop',
              side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
              align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
              className,
            )}
          >
            {items
              ? items.map((item, i) => {
                  if (item.divider) return <div key={`d-${i}`} className="my-1 h-px bg-line" role="separator" />
                  if (item.heading) {
                    return (
                      <div key={`h-${i}`} className="px-2.5 pt-2 pb-1 text-xxs font-medium tracking-wide text-faint uppercase">
                        {item.heading}
                      </div>
                    )
                  }
                  const Icon = item.icon
                  return (
                    <button
                      key={item.key ?? item.label}
                      type="button"
                      role={item.checked !== undefined ? 'menuitemradio' : 'menuitem'}
                      aria-checked={item.checked}
                      data-idx={i}
                      tabIndex={active === i ? 0 : -1}
                      disabled={item.disabled}
                      title={item.disabledReason}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => {
                        close(!item.keepFocusOnSelect)
                        item.onSelect?.()
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none sm:py-1.5',
                        'focus-visible:bg-subtle focus-visible:outline-none',
                        active === i && 'bg-subtle',
                        item.danger ? 'text-red-600' : 'text-ink',
                        item.disabled && 'cursor-not-allowed opacity-45',
                      )}
                    >
                      {Icon && <Icon size={15} className={item.danger ? 'text-red-500' : 'text-muted'} aria-hidden />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.label}</span>
                        {item.description && <span className="block truncate text-xxs text-muted">{item.description}</span>}
                      </span>
                      {item.checked && <Check size={15} className="text-brand-600" aria-hidden />}
                    </button>
                  )
                })
              : children?.(close)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
