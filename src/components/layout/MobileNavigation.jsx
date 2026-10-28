import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import BrandMark from './BrandMark'
import NavList from './NavList'
import SidebarProfile from './SidebarProfile'

/** Slide-in navigation drawer for phones. */
export default function MobileNavigation({ open, onClose }) {
  return createPortal(<AnimatePresence>{open && <MobileNavPanel onClose={onClose} />}</AnimatePresence>, document.body)
}

function MobileNavPanel({ onClose }) {
  const ref = useFocusTrap(true, onClose)
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <motion.div
        className="absolute inset-0 bg-gray-950/35"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="bg-surface shadow-lift absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col outline-none"
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      >
        <div className="border-line flex h-14 items-center justify-between border-b px-4">
          <BrandMark onClick={onClose} />
          <button type="button" onClick={onClose} className="text-muted hover:bg-subtle rounded-md p-2" aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <NavList onNavigate={onClose} layoutGroup="mobile" />
        <div className="border-line border-t p-3">
          <SidebarProfile onNavigate={onClose} />
        </div>
      </motion.div>
    </div>
  )
}
