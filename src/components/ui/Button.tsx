import { forwardRef, type ButtonHTMLAttributes, type ComponentType, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { Loader2, type LucideProps } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-subtle disabled:text-muted',
  ghost: 'text-ink-soft hover:bg-subtle hover:text-ink disabled:text-muted',
  danger: 'bg-danger text-white hover:bg-red-800 disabled:bg-danger/50',
  ai: 'bg-lavender text-ai hover:bg-lavender-strong disabled:opacity-60',
}
const SIZES: Record<Size, string> = { sm: 'h-8 text-[13px] gap-1.5', md: 'h-9 text-sm gap-2' }
// Padding is separate so icon-only buttons are not squeezed by it.
const PADDING: Record<Size, string> = { sm: 'px-2.5', md: 'px-3.5' }

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ComponentType<LucideProps>
  loading?: boolean
  /** Square icon-only button; requires aria-label. */
  iconOnly?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading, iconOnly, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        iconOnly ? (size === 'sm' ? 'w-8' : 'w-9') : PADDING[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : Icon ? <Icon size={iconOnly ? 17 : 15} className="shrink-0" aria-hidden /> : null}
      {!iconOnly && children}
    </button>
  )
})

/** A link styled as a button — for navigation (never nest a <button> inside a <Link>). */
export function LinkButton({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ComponentType<LucideProps>; children: ReactNode }) {
  return (
    <Link
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors',
        VARIANTS[variant],
        SIZES[size],
        PADDING[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={15} aria-hidden />}
      {children}
    </Link>
  )
}
