import { motion } from 'framer-motion'
import { Briefcase, MapPin } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import StageBadge from './StageBadge'
import { formatRelative } from '@/utils/formatDate'

/** Compact summary of one candidate row — used for phone rows and the compact list view. */
export function CandidateSummary({ row, showSkills = false }) {
  const { candidate, primary } = row
  return (
    <div className="flex min-w-0 gap-3">
      <Avatar name={row.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.name}</p>
            <p className="truncate text-xs text-muted">
              {candidate.currentTitle} · {candidate.experienceYears} yrs
            </p>
          </div>
          <span className="shrink-0 text-xxs text-faint">{formatRelative(row.appliedAt)}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          <StageBadge app={primary?.app} stage={primary?.stage} />
          {primary && (
            <span className="flex min-w-0 items-center gap-1">
              <Briefcase size={12} aria-hidden />
              <span className="truncate">{primary.job.title}</span>
            </span>
          )}
          {candidate.location && (
            <span className="flex items-center gap-1">
              <MapPin size={12} aria-hidden />
              {candidate.location}
            </span>
          )}
        </div>
        {showSkills && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {candidate.skills.slice(0, 4).map((s) => (
              <span key={s} className="rounded bg-subtle px-1.5 py-0.5 text-xxs text-ink-soft">
                {s}
              </span>
            ))}
            {candidate.skills.length > 4 && <span className="px-1 text-xxs text-faint">+{candidate.skills.length - 4}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

/** Compact grid view of candidates for scanning many profiles at once. */
export default function CandidateList({ rows, onOpen }) {
  return (
    <ul className="grid gap-px bg-line sm:grid-cols-2 2xl:grid-cols-3">
      {rows.map((row, i) => (
        <motion.li key={row.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, delay: Math.min(i, 10) * 0.015 }} className="bg-surface">
          <button type="button" onClick={() => onOpen(row)} className="block h-full w-full px-4 py-4 text-left transition-colors hover:bg-subtle/60" aria-label={`Open quick view for ${row.name}`}>
            <CandidateSummary row={row} showSkills />
          </button>
        </motion.li>
      ))}
    </ul>
  )
}
