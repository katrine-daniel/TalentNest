import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Full width unless the caller sets its own width (e.g. `w-auto` in a filter bar). */
const width = (className?: string) => (className && /(^|\s)w-/.test(className) ? '' : 'w-full')

const control =
  'rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-muted/80 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15 disabled:bg-subtle disabled:text-muted'

export interface FieldProps {
  label: ReactNode
  error?: string | null
  hint?: ReactNode
  required?: boolean
  className?: string
  children: (a11y: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; required?: boolean }) => ReactNode
}

/** Label, control, hint and error wired together for screen readers. */
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId()
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="text-ink-soft mb-1 block text-[13px] font-medium">
        {label}
        {required && (
          <span className="text-danger ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, required })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-muted mt-1 text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-danger mt-1 text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input ref={ref} className={cn(control, width(className), 'h-9', rest['aria-invalid'] ? 'border-danger' : 'border-line-strong', className)} {...rest} />
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(control, width(className), 'py-2 leading-relaxed', rest['aria-invalid'] ? 'border-danger' : 'border-line-strong', className)}
      {...rest}
    />
  )
})

export interface Option {
  value: string
  label: string
  disabled?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { options: Option[]; placeholder?: string }>(function Select(
  { options, placeholder, className, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, width(className), 'h-9 pr-8', rest['aria-invalid'] ? 'border-danger' : 'border-line-strong', className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
})

export function Checkbox({ label, description, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input id={id} type="checkbox" className="accent-brand-600 mt-0.5 size-4 shrink-0" {...rest} />
      <label htmlFor={id} className="text-sm">
        <span className="text-ink">{label}</span>
        {description && <span className="text-muted block text-xs">{description}</span>}
      </label>
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="bg-danger-soft text-danger rounded-md px-3 py-2 text-sm">
      {message}
    </p>
  )
}
