import { useId, useRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

/**
 * Underlined tab list with keyboard support (arrow keys).
 * tabs: [{ value, label, count?, icon? }]
 */
export default function Tabs({ tabs, value, onChange, className, label = 'Sections' }) {
  const layoutId = useId()
  const refs = useRef([])

  const onKey = (e, i) => {
    let next = null
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length
    if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = tabs.length - 1
    if (next !== null) {
      e.preventDefault()
      refs.current[next]?.focus()
      onChange(tabs[next].value)
    }
  }

  return (
    <div role="tablist" aria-label={label} className={cn('no-scrollbar border-line -mb-px flex gap-1 overflow-x-auto border-b', className)}>
      {tabs.map((tab, i) => {
        const selected = tab.value === value
        const Icon = tab.icon
        return (
          <button
            key={tab.value}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
              selected ? 'text-ink font-medium' : 'text-muted hover:text-ink',
            )}
          >
            {Icon && <Icon size={15} aria-hidden />}
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('text-xxs tabular rounded px-1.5', selected ? 'bg-brand-50 text-brand-700' : 'bg-subtle text-muted')}>{tab.count}</span>
            )}
            {selected && (
              <motion.span layoutId={layoutId} className="bg-brand-600 absolute inset-x-2 -bottom-px h-0.5 rounded-full" transition={{ duration: 0.2 }} />
            )}
          </button>
        )
      })}
    </div>
  )
}
