import { useId } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useFocusTrap } from '@/hooks/useFocusTrap'

const WIDTHS = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-2xl',
}

/** Right-side panel for quick views. Full screen on mobile. */
export default function Drawer({ open, onClose, title, subtitle, headerActions, size = 'lg', children, footer }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <DrawerInner onClose={onClose} title={title} subtitle={subtitle} headerActions={headerActions} size={size} footer={footer}>
          {children}
        </DrawerInner>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function DrawerInner({ onClose, title, subtitle, headerActions, size, children, footer }) {
  const ref = useFocusTrap(true, onClose)
  const titleId = useId()
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div
        className="absolute inset-0 bg-gray-950/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('relative flex h-full w-full flex-col bg-surface shadow-lift outline-none', WIDTHS[size])}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
          </div>
          {headerActions}
          <button type="button" onClick={onClose} className="-mr-1.5 rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink" aria-label="Close panel">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto scrollbar-thin">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </motion.aside>
    </div>
  )
}
