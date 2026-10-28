import StatusBadge from '@/components/ui/StatusBadge'
import { useLookups } from '@/hooks/useStore'
import { cn } from '@/utils/cn'
import type { InterviewFeedback } from '@/types/domain'
import { RECOMMENDATIONS } from './FeedbackSummary'
import { panelConsensus } from '../feedbackSelectors'

/**
 * Criterion-by-criterion comparison of the panel's submitted scorecards.
 * Large disagreements (2+ points) are highlighted so the panel can discuss them.
 */
export default function FeedbackComparison({ feedback, scorecardId }: { feedback: InterviewFeedback[]; scorecardId: string }) {
  const { scorecardsById, usersById } = useLookups()
  const scorecard = scorecardsById.get(scorecardId)
  const submitted = feedback.filter((f) => f.status === 'submitted')
  if (submitted.length < 2 || !scorecard) return null
  const consensus = panelConsensus(submitted)

  return (
    <div className="border-line overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[420px] text-xs">
        <caption className="text-muted px-3 py-2 text-left">
          Panel comparison · <StatusBadge tone={consensus.tone}>{consensus.label}</StatusBadge>
        </caption>
        <thead>
          <tr className="border-line bg-subtle/50 border-y">
            <th scope="col" className="text-muted px-3 py-2 text-left font-medium">
              Criterion
            </th>
            {submitted.map((f) => (
              <th key={f.id} scope="col" className="px-3 py-2 text-center font-medium">
                {usersById.get(f.interviewerId)?.name.split(' ')[0] ?? 'Interviewer'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {scorecard.criteria.map((c) => {
            const values = submitted.map((f) => f.ratings[c.id] ?? 0)
            const spread = Math.max(...values) - Math.min(...values)
            return (
              <tr key={c.id} className={cn(spread >= 2 && 'bg-amber-50')}>
                <th scope="row" className="text-ink-soft px-3 py-2 text-left font-normal">
                  {c.name}
                  {spread >= 2 && <span className="ml-1 text-amber-700">· discuss</span>}
                </th>
                {values.map((v, i) => (
                  <td key={submitted[i]?.id} className="tabular px-3 py-2 text-center font-medium">
                    {v || '—'}
                  </td>
                ))}
              </tr>
            )
          })}
          <tr>
            <th scope="row" className="text-ink-soft px-3 py-2 text-left font-normal">
              Recommendation
            </th>
            {submitted.map((f) => {
              const rec = RECOMMENDATIONS.find((r) => r.value === f.recommendation)
              return (
                <td key={f.id} className="px-3 py-2 text-center">
                  {rec ? <StatusBadge tone={rec.tone}>{rec.label}</StatusBadge> : '—'}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
