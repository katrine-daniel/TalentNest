import StatusBadge from '@/components/ui/StatusBadge'
import { useLookups } from '@/hooks/useStore'
import { formatDate } from '@/utils/formatDate'

export const RECOMMENDATIONS = [
  { value: 'strong-yes', label: 'Strong yes', tone: 'green' },
  { value: 'yes', label: 'Yes', tone: 'green' },
  { value: 'no', label: 'No', tone: 'red' },
  { value: 'strong-no', label: 'Strong no', tone: 'red' },
]

/** Read-only view of a submitted scorecard. */
export default function FeedbackSummary({ interview }) {
  const { scorecardsById, usersById } = useLookups()
  const { feedback } = interview
  const scorecard = scorecardsById.get(interview.scorecardId)
  const rec = RECOMMENDATIONS.find((r) => r.value === feedback.recommendation)
  const values = Object.values(feedback.ratings)
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0

  return (
    <div className="border-line bg-subtle/40 rounded-lg border p-3.5">
      <div className="text-muted flex flex-wrap items-center gap-2 text-xs">
        <StatusBadge tone={rec?.tone}>{rec?.label}</StatusBadge>
        <span>
          Average <strong className="text-ink tabular font-semibold">{avg.toFixed(1)}</strong> / 5
        </span>
        <span>
          · {usersById.get(feedback.submittedById)?.name ?? 'Interviewer'}, {formatDate(feedback.submittedAt)}
        </span>
      </div>
      {scorecard && (
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {scorecard.criteria.map((c) => {
            const v = feedback.ratings[c.id] ?? 0
            return (
              <div key={c.id} className="flex items-center gap-3 text-xs">
                <dt className="text-ink-soft w-32 shrink-0 truncate">{c.name}</dt>
                <dd className="flex flex-1 items-center gap-2">
                  <span className="flex flex-1 gap-0.5" aria-hidden>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= v ? 'bg-brand-500' : 'bg-line'}`} />
                    ))}
                  </span>
                  <span className="tabular w-4 text-right font-medium">{v}</span>
                </dd>
              </div>
            )
          })}
        </dl>
      )}
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <p>
          <span className="text-xxs block font-medium text-emerald-700 uppercase">Strengths</span>
          {feedback.strengths || '—'}
        </p>
        <p>
          <span className="text-xxs block font-medium text-red-600 uppercase">Concerns</span>
          {feedback.concerns || '—'}
        </p>
      </div>
      {feedback.summary && <p className="text-ink-soft mt-2 text-sm">{feedback.summary}</p>}
    </div>
  )
}
