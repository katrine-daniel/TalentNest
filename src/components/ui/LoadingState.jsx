import { cn } from '@/utils/cn'

export function Skeleton({ className, style }) {
  return <div className={cn('animate-pulse rounded-md bg-gray-200/70', className)} style={style} aria-hidden />
}

export function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <div className="divide-line divide-y" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-8 w-8 rounded-full" />
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-3', c === 0 ? 'w-40' : 'hidden w-24 md:block')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 240 }) {
  return (
    <div className="flex items-end gap-2 px-2" style={{ height }} role="status" aria-label="Loading chart">
      {[40, 65, 50, 80, 60, 90, 70, 85].map((h, i) => (
        <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

/** Full page placeholder used while the data layer loads. */
export default function LoadingState({ variant = 'page' }) {
  if (variant === 'inline') {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <span className="border-brand-200 border-t-brand-600 h-5 w-5 animate-spin rounded-full border-2" />
        <span className="sr-only">Loading</span>
      </div>
    )
  }
  return (
    <div className="space-y-6" role="status" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      <div className="border-line bg-line grid grid-cols-2 gap-px overflow-hidden rounded-xl border md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-surface space-y-3 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-14" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="border-line/80 bg-surface shadow-card rounded-2xl border p-5 lg:col-span-2">
          <ChartSkeleton />
        </div>
        <div className="border-line/80 bg-surface shadow-card space-y-3 rounded-2xl border p-5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
