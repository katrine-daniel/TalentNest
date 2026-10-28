import { cn } from '@/utils/cn'

/** Small inline toggle group (view switches, ranges). options: [{ value, label, icon? }] */
export default function SegmentedControl({ options, value, onChange, label, size = 'md', className }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('border-line-strong bg-subtle inline-flex rounded-lg border p-0.5', className)}>
      {options.map((o) => {
        const selected = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.iconOnly ? o.label : undefined}
            title={o.iconOnly ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-150',
              size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-xs sm:text-sm',
              selected ? 'bg-surface text-ink ring-line shadow-xs ring-1' : 'text-muted hover:text-ink',
            )}
          >
            {Icon && <Icon size={14} aria-hidden />}
            {!o.iconOnly && o.label}
          </button>
        )
      })}
    </div>
  )
}
