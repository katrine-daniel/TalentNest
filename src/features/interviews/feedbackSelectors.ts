import type { Interview, InterviewFeedback, Recommendation, ScorecardTemplate } from '@/types/domain'

export const POSITIVE: Recommendation[] = ['yes', 'strong-yes']

export function feedbackForInterview(all: readonly InterviewFeedback[], interviewId: string) {
  return all.filter((f) => f.interviewId === interviewId)
}

export interface FeedbackCompletion {
  submitted: number
  total: number
  complete: boolean
  pendingInterviewerIds: string[]
}

/** How many panelists have submitted a scorecard for a completed interview. */
export function feedbackCompletion(interview: Pick<Interview, 'id' | 'interviewerIds'>, all: readonly InterviewFeedback[]): FeedbackCompletion {
  const submittedBy = new Set(all.filter((f) => f.interviewId === interview.id && f.status === 'submitted').map((f) => f.interviewerId))
  const pendingInterviewerIds = interview.interviewerIds.filter((id) => !submittedBy.has(id))
  const submitted = interview.interviewerIds.length - pendingInterviewerIds.length
  return { submitted, total: interview.interviewerIds.length, complete: pendingInterviewerIds.length === 0, pendingInterviewerIds }
}

export function isFeedbackPending(interview: Interview, all: readonly InterviewFeedback[]) {
  return interview.status === 'completed' && !feedbackCompletion(interview, all).complete
}

export function averageRating(fb: Pick<InterviewFeedback, 'ratings'>) {
  const values = Object.values(fb.ratings).filter((v) => v > 0)
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

/** Weighted score (0–5) using the scorecard's criterion weights. */
export function weightedScore(fb: Pick<InterviewFeedback, 'ratings'>, scorecard: ScorecardTemplate | undefined) {
  if (!scorecard) return averageRating(fb)
  const total = scorecard.criteria.reduce((s, c) => s + c.weight, 0) || 1
  return scorecard.criteria.reduce((s, c) => s + (fb.ratings[c.id] ?? 0) * c.weight, 0) / total
}

/**
 * Summarises the panel's submitted recommendations. This is a tally, not a decision:
 * the hiring team still decides, and disagreement is surfaced explicitly.
 */
export function panelConsensus(submitted: readonly InterviewFeedback[]): {
  label: string
  tone: 'green' | 'red' | 'amber' | 'neutral'
  positive: number
  total: number
} {
  const total = submitted.length
  const positive = submitted.filter((f) => f.recommendation && POSITIVE.includes(f.recommendation)).length
  if (!total) return { label: 'No feedback yet', tone: 'neutral', positive, total }
  if (positive === total) return { label: total > 1 ? 'Panel agrees: advance' : 'Recommends advancing', tone: 'green', positive, total }
  if (positive === 0) return { label: total > 1 ? 'Panel agrees: do not advance' : 'Does not recommend', tone: 'red', positive, total }
  return { label: `Split panel (${positive}/${total} advance)`, tone: 'amber', positive, total }
}
