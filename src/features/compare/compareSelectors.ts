/**
 * Side-by-side comparison of applications for one vacancy. Deliberately produces
 * per-dimension facts rather than a single overall score, so reviewers weigh the
 * evidence themselves.
 */
import type { Application, Assessment, AssessmentTemplate, Candidate, Interview, InterviewFeedback, Job, ScorecardTemplate } from '@/types/domain'
import { POSITIVE } from '@/features/interviews/feedbackSelectors'

export const MAX_COMPARE = 4

export interface CriterionScore {
  name: string
  average: number | null
  ratings: number
}

export interface ComparisonColumn {
  application: Application
  candidate: Candidate
  matchedSkills: string[]
  missingSkills: string[]
  experienceFit: 'below' | 'within' | 'above'
  assessments: Array<{ name: string; score: number | null; passMark: number; passed: boolean | null; status: Assessment['status'] }>
  criteria: CriterionScore[]
  recommendations: { positive: number; total: number }
  pendingFeedback: number
}

interface Data {
  candidates: readonly Candidate[]
  assessments: readonly Assessment[]
  assessmentTemplates: readonly AssessmentTemplate[]
  interviews: readonly Interview[]
  feedback: readonly InterviewFeedback[]
  scorecards: readonly ScorecardTemplate[]
}

const lc = (s: string) => s.toLowerCase()

export function buildComparison(job: Job, applications: readonly Application[], data: Data): ComparisonColumn[] {
  const scorecards = new Map(data.scorecards.map((s) => [s.id, s]))
  const templates = new Map(data.assessmentTemplates.map((t) => [t.id, t]))

  return applications.flatMap((application) => {
    const candidate = data.candidates.find((c) => c.id === application.candidateId)
    if (!candidate) return []
    const have = new Set(candidate.skills.map(lc))
    const matchedSkills = job.skills.filter((s) => have.has(lc(s)))
    const missingSkills = job.skills.filter((s) => !have.has(lc(s)))
    const experienceFit = candidate.experienceYears < job.experienceMin ? 'below' : candidate.experienceYears > job.experienceMax ? 'above' : 'within'

    const assessments = data.assessments
      .filter((a) => a.applicationId === application.id && a.status !== 'cancelled')
      .map((a) => {
        const t = templates.get(a.templateId)
        const passMark = t?.passMark ?? 0
        return {
          name: t?.name ?? 'Assessment',
          score: a.score,
          passMark,
          passed: a.status === 'evaluated' && a.score !== null ? a.score >= passMark : null,
          status: a.status,
        }
      })

    const interviews = data.interviews.filter((i) => i.applicationId === application.id && i.status === 'completed')
    const byCriterion = new Map<string, number[]>()
    let positive = 0
    let total = 0
    let pendingFeedback = 0
    interviews.forEach((iv) => {
      const sc = scorecards.get(iv.scorecardId)
      const submitted = data.feedback.filter((f) => f.interviewId === iv.id && f.status === 'submitted')
      pendingFeedback += iv.interviewerIds.length - new Set(submitted.map((f) => f.interviewerId)).size
      submitted.forEach((f) => {
        total += 1
        if (f.recommendation && POSITIVE.includes(f.recommendation)) positive += 1
        sc?.criteria.forEach((c) => {
          const r = f.ratings[c.id]
          if (r && r > 0) byCriterion.set(c.name, [...(byCriterion.get(c.name) ?? []), r])
        })
      })
    })
    const criteria = [...byCriterion.entries()].map(([name, rs]) => ({ name, ratings: rs.length, average: rs.reduce((a, b) => a + b, 0) / rs.length }))

    return [
      { application, candidate, matchedSkills, missingSkills, experienceFit, assessments, criteria, recommendations: { positive, total }, pendingFeedback },
    ]
  })
}

/** Union of criterion names across the compared columns, in first-seen order. */
export function criterionNames(columns: readonly ComparisonColumn[]) {
  return Array.from(new Set(columns.flatMap((c) => c.criteria.map((k) => k.name))))
}

/** Plain-language, evidence-only observations. Never ranks candidates or recommends a hire. */
export function summarise(columns: readonly ComparisonColumn[], job: Job): string[] {
  if (columns.length < 2) return []
  const name = (c: ComparisonColumn) => c.candidate.firstName
  const notes: string[] = []
  const bestSkills = Math.max(...columns.map((c) => c.matchedSkills.length))
  const skillLeaders = columns.filter((c) => c.matchedSkills.length === bestSkills)
  if (job.skills.length && skillLeaders.length < columns.length)
    notes.push(
      `${skillLeaders.map(name).join(' and ')} list${skillLeaders.length === 1 ? 's' : ''} the most required skills (${bestSkills}/${job.skills.length}).`,
    )
  const outside = columns.filter((c) => c.experienceFit !== 'within')
  if (outside.length)
    notes.push(
      `${outside.map((c) => `${name(c)} (${c.experienceFit} range)`).join(', ')} — outside the ${job.experienceMin}–${job.experienceMax} yr experience range.`,
    )
  const noInterview = columns.filter((c) => c.recommendations.total === 0)
  if (noInterview.length)
    notes.push(`No submitted interview feedback yet for ${noInterview.map(name).join(', ')} — comparison on interview criteria is incomplete.`)
  const pending = columns.filter((c) => c.pendingFeedback > 0)
  if (pending.length) notes.push(`Scorecards still outstanding for ${pending.map((c) => `${name(c)} (${c.pendingFeedback})`).join(', ')}.`)
  criterionNames(columns).forEach((crit) => {
    const scored = columns
      .map((c) => ({ c, s: c.criteria.find((k) => k.name === crit)?.average ?? null }))
      .filter((x): x is { c: ComparisonColumn; s: number } => x.s !== null)
    if (scored.length < 2) return
    const max = Math.max(...scored.map((x) => x.s))
    const min = Math.min(...scored.map((x) => x.s))
    // Flag only differences of 1.5+ points on the 1–5 scale; one point is ordinary rater variance.
    if (max - min >= 1.5) notes.push(`Panel ratings differ on “${crit}”: ${scored.map((x) => `${name(x.c)} ${x.s.toFixed(1)}`).join(' vs ')}.`)
  })
  return notes
}
