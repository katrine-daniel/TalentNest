import StatusBadge, { type Tone } from '@/components/ui/StatusBadge'
import { useLookups } from '@/hooks/useStore'
import { formatDate } from '@/utils/formatDate'
import type { InterviewFeedback, Recommendation } from '@/types/domain'
import { averageRating } from '../feedbackSelectors'

export const RECOMMENDATIONS: Array<{ value: Recommendation; label: string; tone: Tone }> = [
  { value: 'strong-yes', label: 'Strong yes', tone: 'green' },
  { value: 'yes', label: 'Yes', tone: 'green' },
  { value: 'no', label: 'No', tone: 'red' },
  { value: 'strong-no', label: 'Strong no', tone: 'red' },
]

/** Read-only view of one interviewer's submitted scorecard, including evidence per criterion. */
export default function FeedbackSummary({ feedback, scorecardId }: { feedback: InterviewFeedback; scorecardId: string }) {
  const { scorecardsById, usersById } = useLookups()
  const scorecard = scorecardsById.get(scorecardId)
  const rec = RECOMMENDATIONS.find((r) => r.value === feedback.recommendation)

  return (
    <div className="border-line bg-subtle/40 rounded-lg border p-3.5">
      <div className="text-muted flex flex-wrap items-center gap-2 text-xs">
        {rec ? <StatusBadge tone={rec.tone}>{rec.label}</StatusBadge> : <StatusBadge tone="neutral">No recommendation</StatusBadge>}
        <span>
          Average <strong className="text-ink tabular font-semibold">{averageRating(feedback).toFixed(1)}</strong> / 5
        </span>
        <span>
          · {usersById.get(feedback.interviewerId)?.name ?? 'Interviewer'}
          {feedback.submittedAt ? `, ${formatDate(feedback.submittedAt)}` : ''}
        </span>
      </div>
      {scorecard && (
        <dl className="mt-3 space-y-2">
          {scorecard.criteria.map((c) => {
            const v = feedback.ratings[c.id] ?? 0
            return (
              <div key={c.id} className="text-xs">
                <div className="flex items-center gap-3">
                  <dt className="text-ink-soft w-36 shrink-0 truncate">{c.name}</dt>
                  <dd className="flex flex-1 items-center gap-2">
                    <span className="flex flex-1 gap-0.5" aria-hidden>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= v ? 'bg-brand-500' : 'bg-line'}`} />
                      ))}
                    </span>
                    <span className="tabular w-4 text-right font-medium">{v || '—'}</span>
                  </dd>
                </div>
                {feedback.evidence?.[c.id] && <p className="text-muted mt-0.5 pl-0 sm:pl-39">“{feedback.evidence[c.id]}”</p>}
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
