import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { getStatusMeta } from '@/utils/statusHelpers'

const TONES = {
  neutral: 'bg-gray-100 text-gray-700 ring-gray-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  blue: 'bg-sky-50 text-sky-700 ring-sky-100',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  amber: 'bg-amber-50 text-amber-800 ring-amber-100',
  teal: 'bg-teal-50 text-teal-700 ring-teal-100',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  red: 'bg-red-50 text-red-700 ring-red-100',
} as const

const DOTS: Record<Tone, string> = {
  neutral: 'bg-gray-400',
  brand: 'bg-brand-500',
  blue: 'bg-sky-500',
  indigo: 'bg-indigo-500',
  amber: 'bg-amber-500',
  teal: 'bg-teal-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
}

export type Tone = keyof typeof TONES

interface StatusBadgeProps {
  /** Resolve label and tone from statusHelpers (e.g. kind="offer" value="sent"). */
  kind?: string
  value?: string
  tone?: Tone
  children?: ReactNode
  dot?: boolean
  className?: string
}

export default function StatusBadge({ kind, value, tone, children, dot = true, className }: StatusBadgeProps) {
  const meta = kind ? (getStatusMeta(kind, value) as { label: ReactNode; tone: Tone }) : { label: children, tone: tone ?? 'neutral' }
  const t: Tone = tone ?? meta.tone ?? 'neutral'
  return (
    <span
      className={cn('text-xxs inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium whitespace-nowrap ring-1 ring-inset', TONES[t], className)}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[t])} aria-hidden />}
      {children ?? meta.label}
    </span>
  )
}
