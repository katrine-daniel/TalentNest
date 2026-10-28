import { useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useIsMobile } from '@/hooks/useMediaQuery'

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

/**
 * Centered dialog on tablet/desktop, bottom sheet on mobile.
 * `footer` is rendered in a sticky action bar.
 */
interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  size?: keyof typeof SIZES
  children?: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
}

export default function Modal({ open, onClose, title, description, size = 'md', children, footer, className, bodyClassName }: ModalProps) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <ModalInner onClose={onClose} title={title} description={description} size={size} footer={footer} className={className} bodyClassName={bodyClassName}>
          {children}
        </ModalInner>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function ModalInner({ onClose, title, description, size = 'md', children, footer, className, bodyClassName }: Omit<ModalProps, 'open'>) {
  const ref = useFocusTrap<HTMLDivElement>(true, onClose)
  const titleId = useId()
  const descId = useId()
  const isMobile = useIsMobile()

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        className="absolute inset-0 bg-gray-950/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn('bg-surface shadow-lift relative flex max-h-[92dvh] w-full flex-col outline-none', 'rounded-t-2xl sm:rounded-xl', SIZES[size], className)}
        initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.98, y: 8 }}
        animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
        exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-200 sm:hidden" aria-hidden />
        <header className="border-line flex items-start gap-4 border-b px-5 pt-4 pb-3.5 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-ink text-base font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-muted mt-0.5 text-xs">
                {description}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:bg-subtle hover:text-ink -mr-1.5 rounded-md p-1.5" aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        <div className={cn('flex-1 scrollbar-thin overflow-y-auto px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>
        {footer && (
          <footer className="border-line bg-subtle/60 flex flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:rounded-b-xl sm:px-6 [&>*]:w-full sm:[&>*]:w-auto">
            {footer}
          </footer>
        )}
      </motion.div>
    </div>
  )
}
