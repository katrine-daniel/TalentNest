import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react'
import { cn } from '@/utils/cn'

const LEVELS = {
  match: { icon: CheckCircle2, className: 'text-emerald-600', label: 'Match' },
  partial: { icon: CircleDashed, className: 'text-amber-600', label: 'Related' },
  missing: { icon: XCircle, className: 'text-faint', label: 'Not found' },
}

/** Requirement-by-requirement skill comparison with evidence. */
export default function SkillMatchPanel({ data }) {
  const { score, rows, experience, extraSkills } = data
  const expText = { below: 'below the required range', within: 'within the required range', above: 'above the required range' }[experience.fit]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#ece4f8" strokeWidth="3.5" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#592ca2"
              strokeWidth="3.5"
              strokeDasharray={`${(score / 100) * 97.4} 97.4`}
              strokeLinecap="round"
            />
          </svg>
          <span className="tabular absolute inset-0 flex items-center justify-center text-sm font-semibold">{score}%</span>
        </div>
        <div className="min-w-0 text-sm">
          <p className="font-medium">Keyword coverage of required skills</p>
          <p className="text-muted">
            {experience.years} years experience — {expText} ({experience.min}–{experience.max} yrs).
          </p>
        </div>
      </div>
      <ul className="divide-line border-line divide-y rounded-lg border">
        {rows.map((r) => {
          const L = LEVELS[r.level]
          return (
            <li key={r.skill} className="flex items-start gap-3 px-3 py-2 text-sm">
              <L.icon size={16} className={cn('mt-0.5 shrink-0', L.className)} aria-label={L.label} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{r.skill}</span>
                <span className="text-muted block text-xs">{r.evidence}</span>
              </span>
              {r.provenance && (
                <span
                  className={cn(
                    'text-xxs shrink-0 rounded px-1.5 py-0.5 font-medium',
                    r.provenance === 'verified' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
                  )}
                >
                  {r.provenance}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {extraSkills.length > 0 && <p className="text-muted text-xs">Additional skills on profile: {extraSkills.join(', ')}</p>}
    </div>
  )
}
