import { useId, type ReactNode } from 'react'
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
interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  headerActions?: ReactNode
  size?: keyof typeof WIDTHS
  children?: ReactNode
  footer?: ReactNode
}

export default function Drawer({ open, onClose, title, subtitle, headerActions, size = 'lg', children, footer }: DrawerProps) {
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

function DrawerInner({ onClose, title, subtitle, headerActions, size = 'lg', children, footer }: Omit<DrawerProps, 'open'>) {
  const ref = useFocusTrap<HTMLElement>(true, onClose)
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
        className={cn('bg-surface shadow-lift relative flex h-full w-full flex-col outline-none', WIDTHS[size])}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
      >
        <header className="border-line flex items-start gap-3 border-b px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold">
              {title}
            </h2>
            {subtitle && <div className="text-muted mt-0.5 text-xs">{subtitle}</div>}
          </div>
          {headerActions}
          <button type="button" onClick={onClose} className="text-muted hover:bg-subtle hover:text-ink -mr-1.5 rounded-md p-1.5" aria-label="Close panel">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 scrollbar-thin overflow-y-auto">{children}</div>
        {footer && <footer className="border-line flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">{footer}</footer>}
      </motion.aside>
    </div>
  )
}
