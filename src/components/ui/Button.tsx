import { forwardRef, type ButtonHTMLAttributes, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, type LucideProps } from 'lucide-react'
import { cn } from '@/utils/cn'

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 shadow-xs',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-subtle active:bg-gray-100 disabled:text-faint',
  ghost: 'text-ink-soft hover:bg-subtle hover:text-ink active:bg-gray-100 disabled:text-faint',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300',
  'danger-ghost': 'text-red-600 hover:bg-red-50 disabled:text-red-300',
  link: 'text-brand-600 hover:text-brand-700 hover:underline underline-offset-2 px-0! h-auto!',
} as const

const SIZES = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-9 sm:h-8 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-10 sm:h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
} as const

const ICON_SIZES = {
  xs: 'h-7 w-7 rounded-md',
  sm: 'h-9 w-9 sm:h-8 sm:w-8 rounded-md',
  md: 'h-10 w-10 sm:h-9 sm:w-9 rounded-lg',
  lg: 'h-11 w-11 rounded-lg',
} as const

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
  icon?: ComponentType<LucideProps>
  iconRight?: ComponentType<LucideProps>
  iconOnly?: boolean
  loading?: boolean
  /** Renders a router link instead of a button. */
  to?: string
  type?: 'button' | 'submit' | 'reset'
  children?: ReactNode
}

/**
 * Primary interactive control. Renders a router Link when `to` is provided.
 * Icon-only buttons must pass an `aria-label`.
 */
const Button = forwardRef<HTMLButtonElement & HTMLAnchorElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    iconOnly = false,
    loading = false,
    to,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  const classes = cn(
    'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-colors duration-150',
    'disabled:cursor-not-allowed',
    VARIANTS[variant],
    iconOnly ? ICON_SIZES[size] : SIZES[size],
    className,
  )
  const iconSize = size === 'xs' || size === 'sm' ? 14 : 16
  const content = (
    <>
      {loading ? <Loader2 size={iconSize} className="animate-spin" aria-hidden /> : Icon ? <Icon size={iconSize} aria-hidden strokeWidth={2} /> : null}
      {!iconOnly && children}
      {!iconOnly && IconRight && <IconRight size={iconSize} aria-hidden />}
    </>
  )

  if (to && !disabled) {
    return (
      <Link ref={ref} to={to} className={classes} {...(props as Record<string, unknown>)}>
        {content}
      </Link>
    )
  }

  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {content}
    </button>
  )
})

export default Button
