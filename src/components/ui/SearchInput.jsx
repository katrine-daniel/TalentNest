import { forwardRef } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/utils/cn'

const SearchInput = forwardRef(function SearchInput({ value, onChange, placeholder = 'Search…', className, label = 'Search', shortcut, ...props }, ref) {
  return (
    <div className={cn('relative', className)}>
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-10 w-full rounded-lg border border-line-strong bg-surface pr-9 pl-9 text-sm text-ink placeholder:text-faint transition-colors outline-none hover:border-gray-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-100 sm:h-9 [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-faint hover:bg-subtle hover:text-ink"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      ) : (
        shortcut && (
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-line bg-subtle px-1.5 text-[10px] font-medium text-muted sm:block">
            {shortcut}
          </kbd>
        )
      )}
    </div>
  )
})

export default SearchInput
