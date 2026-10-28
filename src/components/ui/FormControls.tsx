import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

const control =
  'w-full rounded-lg border bg-surface text-sm text-ink placeholder:text-faint transition-colors outline-none disabled:bg-subtle disabled:text-muted ' +
  'hover:border-gray-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-100'

const stateClass = (invalid?: boolean) => (invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-line-strong')

export interface FieldA11yProps {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
}

export interface Option {
  value: string
  label: string
  disabled?: boolean
}

interface FieldProps {
  label?: ReactNode
  error?: string | null
  hint?: ReactNode
  required?: boolean
  optional?: boolean
  className?: string
  id?: string
  /** A render function receives the id and ARIA attributes to spread onto the control. */
  children: ReactNode | ((a11y: FieldA11yProps) => ReactNode)
}

/** Label + control + hint/error wrapper. */
export function Field({ label, error, hint, required, children, className, id: idProp, optional }: FieldProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-ink-soft text-xs font-medium">
          {label}
          {required && (
            <span className="ml-0.5 text-red-500" aria-hidden>
              *
            </span>
          )}
          {optional && <span className="text-faint ml-1 font-normal">(optional)</span>}
        </label>
      )}
      {typeof children === 'function' ? children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined }) : children}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1 text-xs text-red-600" role="alert">
          <AlertCircle size={12} aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type InvalidProp = { invalid?: boolean; 'data-autofocus'?: boolean }

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & InvalidProp>(function Input({ className, invalid, ...props }, ref) {
  return <input ref={ref} className={cn(control, stateClass(invalid), 'h-10 px-3 sm:h-9', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & InvalidProp>(function Textarea(
  { className, invalid, rows = 3, ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(control, stateClass(invalid), 'resize-y px-3 py-2 leading-relaxed', className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & InvalidProp & { options?: Option[]; placeholder?: string }>(
  function Select({ className, invalid, options = [], placeholder, children, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(control, stateClass(invalid), 'h-10 appearance-none pr-8 pl-3 sm:h-9', className)} {...props}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown size={15} className="text-faint pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2" aria-hidden />
      </div>
    )
  },
)

/** Compact select used in filter bars. The value `all` means "no filter". */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = 'All',
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Option[]
  allLabel?: string
  className?: string
}) {
  const active = value && value !== 'all'
  return (
    <div className={cn('relative', className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'bg-surface focus:border-brand-500 focus:ring-brand-100 h-10 w-full appearance-none rounded-lg border pr-8 pl-3 text-sm transition-colors outline-none hover:border-gray-300 focus:ring-3 sm:h-9',
          active ? 'border-brand-300 text-brand-800' : 'border-line-strong text-ink-soft',
        )}
      >
        <option value="all">
          {label}: {allLabel}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} className="text-faint pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2" aria-hidden />
    </div>
  )
}

export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; description?: ReactNode }>(
  function Checkbox({ label, description, className, ...props }, ref) {
    return (
      <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm', className)}>
        <input ref={ref} type="checkbox" className="border-line-strong accent-brand-600 mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded" {...props} />
        <span>
          <span className="text-ink">{label}</span>
          {description && <span className="text-muted block text-xs">{description}</span>}
        </span>
      </label>
    )
  },
)

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  size = 'md',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-50',
        size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
        checked ? 'bg-brand-600' : 'bg-gray-300',
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full bg-white shadow-sm transition-transform duration-150',
          size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
          checked ? (size === 'sm' ? 'translate-x-4.5' : 'translate-x-5.5') : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
