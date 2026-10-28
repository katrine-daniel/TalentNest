import { forwardRef, type InputHTMLAttributes } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/utils/cn'

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string
  onChange: (v: string) => void
  label?: string
  shortcut?: string
  'data-autofocus'?: boolean
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, placeholder = 'Search…', className, label = 'Search', shortcut, ...props },
  ref,
) {
  return (
    <div className={cn('relative', className)}>
      <Search size={15} className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="border-line-strong bg-surface text-ink placeholder:text-faint focus:border-brand-500 focus:ring-brand-100 h-10 w-full rounded-lg border pr-9 pl-9 text-sm transition-colors outline-none hover:border-gray-300 focus:ring-3 sm:h-9 [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-faint hover:bg-subtle hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      ) : (
        shortcut && (
          <kbd className="border-line bg-subtle text-muted pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border px-1.5 text-[10px] font-medium sm:block">
            {shortcut}
          </kbd>
        )
      )}
    </div>
  )
})

export default SearchInput
