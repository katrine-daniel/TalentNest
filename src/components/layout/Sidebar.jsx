import { motion } from 'framer-motion'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/utils/cn'
import BrandMark from './BrandMark'
import NavList from './NavList'

/** Desktop/tablet sidebar. Tablet shows a collapsed icon rail; desktop can toggle. */
export default function Sidebar({ collapsed, canToggle, onToggle }) {
  return (
    <motion.aside
      className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface md:flex"
      initial={false}
      animate={{ width: collapsed ? 64 : 256 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
    >
      <div className={cn('flex h-14 items-center border-b border-line', collapsed ? 'justify-center px-2' : 'px-5')}>
        <BrandMark collapsed={collapsed} />
      </div>
      <NavList collapsed={collapsed} layoutGroup="sidebar" />
      {canToggle && (
        <div className={cn('border-t border-line p-3', collapsed && 'flex justify-center')}>
          <button
            type="button"
            onClick={onToggle}
            className={cn('flex h-9 items-center gap-2 rounded-lg px-3 text-xs text-muted hover:bg-subtle hover:text-ink', collapsed ? 'w-9 justify-center px-0' : 'w-full')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      )}
    </motion.aside>
  )
}
