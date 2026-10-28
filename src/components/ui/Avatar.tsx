import { cn } from '@/utils/cn'

const PALETTE = [
  'bg-brand-100 text-brand-800',
  'bg-sky-100 text-sky-800',
  'bg-teal-100 text-teal-800',
  'bg-amber-100 text-amber-900',
  'bg-rose-100 text-rose-800',
  'bg-indigo-100 text-indigo-800',
  'bg-emerald-100 text-emerald-800',
]

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
} as const

export type AvatarSize = keyof typeof SIZES

function hash(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

interface AvatarProps {
  name?: string
  size?: AvatarSize
  className?: string
  title?: string
  /** `brand` is reserved for the signed-in user so they stand out from candidates. */
  variant?: 'brand'
}

export default function Avatar({ name = '', size = 'sm', className, title, variant }: AvatarProps) {
  const tone = variant === 'brand' ? 'bg-linear-to-br from-brand-500 to-brand-800 text-white' : PALETTE[hash(name) % PALETTE.length]
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none', tone, SIZES[size], className)}
      title={title ?? name}
      aria-hidden={!title}
    >
      {initials(name)}
    </span>
  )
}

export function AvatarStack({ names = [], max = 3, size = 'xs' }: { names?: string[]; max?: number; size?: AvatarSize }) {
  const shown = names.slice(0, max)
  return (
    <span className="flex -space-x-1.5">
      {shown.map((n) => (
        <Avatar key={n} name={n} size={size} className="ring-surface ring-2" title={n} />
      ))}
      {names.length > max && (
        <span className="text-muted ring-surface inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium ring-2">
          +{names.length - max}
        </span>
      )}
    </span>
  )
}
