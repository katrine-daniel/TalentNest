import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

/**
 * Horizontal funnel with stage-to-stage conversion. Custom-drawn so labels,
 * counts and conversion stay legible at every width.
 */
export default function RecruitmentFunnel({ steps, compact = false }) {
  const max = Math.max(1, steps[0]?.count ?? 1)
  return (
    <ol className={cn('space-y-3', compact && 'space-y-2.5')}>
      {steps.map((step, i) => {
        const width = Math.max(4, (step.count / max) * 100)
        return (
          <li key={step.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="text-ink-soft font-medium">{step.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="text-ink tabular text-sm font-semibold">{step.count}</span>
                {i > 0 && <span className={cn('tabular w-10 text-right', step.conversion < 40 ? 'text-amber-700' : 'text-muted')}>{step.conversion}%</span>}
                {i === 0 && <span className="w-10" aria-hidden />}
              </span>
            </div>
            <div className="bg-subtle h-2 overflow-hidden rounded-full" role="presentation">
              <motion.div
                className="h-full rounded-full"
                style={{ background: `color-mix(in srgb, #592ca2 ${100 - i * 12}%, #d9c9f0)` }}
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.5, delay: i * 0.04, ease: [0.2, 0, 0, 1] }}
              />
            </div>
          </li>
        )
      })}
      <li className="text-xxs text-faint pt-1">Percentages show conversion from the previous stage.</li>
    </ol>
  )
}
