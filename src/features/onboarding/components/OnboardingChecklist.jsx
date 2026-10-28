import { motion } from 'framer-motion'
import { CalendarDays, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import Avatar from '@/components/ui/Avatar'
import { formatDate, formatRelative } from '@/utils/formatDate'
import { cn } from '@/utils/cn'

/** New-hire onboarding progress with a toggleable task checklist. */
export default function OnboardingChecklist({ offer, candidateName, jobTitle, onToggle, disabled }) {
  const done = offer.onboarding.filter((t) => t.done).length
  const pct = Math.round((done / offer.onboarding.length) * 100)
  return (
    <article className="border-line/80 bg-surface shadow-card flex flex-col rounded-2xl border">
      <header className="flex items-start gap-3 p-4">
        <Avatar name={candidateName} size="md" />
        <div className="min-w-0 flex-1">
          <Link to={`/candidates/${offer.candidateId}`} className="block truncate font-medium hover:underline">
            {candidateName}
          </Link>
          <p className="text-muted truncate text-xs">{jobTitle}</p>
          <p className="text-ink-soft mt-1 flex items-center gap-1 text-xs">
            <CalendarDays size={12} aria-hidden /> Starts {formatDate(offer.startDate)} ({formatRelative(offer.startDate)})
          </p>
        </div>
        <span className={cn('tabular text-sm font-semibold', pct === 100 ? 'text-emerald-600' : 'text-ink')}>{pct}%</span>
      </header>
      <div className="bg-subtle mx-4 h-1.5 overflow-hidden rounded-full">
        <motion.div
          className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-brand-600')}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <ul className="mt-3 space-y-0.5 px-2 pb-3">
        {offer.onboarding.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={task.done}
              disabled={disabled}
              onClick={() => onToggle(offer.id, task.id)}
              className="hover:bg-subtle flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed"
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                  task.done ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong',
                )}
              >
                {task.done && <Check size={11} strokeWidth={3} aria-hidden />}
              </span>
              <span className={cn(task.done ? 'text-muted line-through' : 'text-ink')}>{task.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </article>
  )
}
