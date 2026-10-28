import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Columns3, Info, Minus, X } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'
import { Field, Select } from '@/components/ui/FormControls'
import { useCollection } from '@/hooks/useStore'
import { cn } from '@/utils/cn'
import { buildComparison, criterionNames, MAX_COMPARE, summarise, type ComparisonColumn } from './compareSelectors'

const FIT = {
  below: { label: 'Below range', tone: 'amber' },
  within: { label: 'Within range', tone: 'green' },
  above: { label: 'Above range', tone: 'blue' },
} as const

function Row({ label, columns, render }: { label: string; columns: ComparisonColumn[]; render: (c: ComparisonColumn) => ReactNode }) {
  return (
    <tr className="border-line/70 border-t align-top">
      <th scope="row" className="text-muted bg-surface sticky left-0 w-40 px-4 py-3 text-left text-xs font-medium">
        {label}
      </th>
      {columns.map((c) => (
        <td key={c.application.id} className="min-w-52 px-4 py-3 text-sm">
          {render(c)}
        </td>
      ))}
    </tr>
  )
}

export default function ComparePage() {
  const jobs = useCollection('jobs')
  const applications = useCollection('applications')
  const candidates = useCollection('candidates')
  const assessments = useCollection('assessments')
  const assessmentTemplates = useCollection('assessmentTemplates')
  const interviews = useCollection('interviews')
  const feedback = useCollection('interviewFeedback')
  const scorecards = useCollection('scorecards')
  const [params, setParams] = useSearchParams()
  const jobId = params.get('job') ?? ''
  const ids = (params.get('apps') ?? '').split(',').filter(Boolean).slice(0, MAX_COMPARE)
  const job = jobs.find((j) => j.id === jobId)

  const jobApps = useMemo(() => applications.filter((a) => a.jobId === jobId && a.status !== 'withdrawn'), [applications, jobId])
  const columns = useMemo(
    () =>
      job
        ? buildComparison(
            job,
            ids.map((id) => jobApps.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => Boolean(a)),
            { candidates, assessments, assessmentTemplates, interviews, feedback, scorecards },
          )
        : [],
    // ids is derived from the URL string; compare on that string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [job, jobApps, params.get('apps'), candidates, assessments, assessmentTemplates, interviews, feedback, scorecards],
  )
  const notes = job ? summarise(columns, job) : []
  const criteria = criterionNames(columns)
  const candidateName = (id: string) => {
    const c = candidates.find((x) => x.id === id)
    return c ? `${c.firstName} ${c.lastName}` : 'Unknown'
  }

  const setApps = (next: string[]) => setParams({ job: jobId, apps: next.join(',') })
  const toggle = (id: string) => setApps(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, MAX_COMPARE))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compare candidates"
        description={`Review up to ${MAX_COMPARE} applicants for the same vacancy side by side. There is no overall score — weigh the evidence per dimension.`}
      />

      <div className="border-line/80 bg-surface grid grid-cols-1 gap-4 rounded-2xl border p-4 md:grid-cols-[minmax(0,320px)_1fr]">
        <Field label="Vacancy">
          {(a) => (
            <Select
              {...a}
              value={jobId}
              onChange={(e) => setParams({ job: e.target.value })}
              options={jobs.map((j) => ({
                value: j.id,
                label: `${j.title} (${applications.filter((x) => x.jobId === j.id && x.status !== 'withdrawn').length})`,
              }))}
              placeholder="Choose a vacancy"
            />
          )}
        </Field>
        {job && (
          <fieldset>
            <legend className="text-ink-soft mb-1.5 text-xs font-medium">
              Applicants ({ids.length}/{MAX_COMPARE} selected)
            </legend>
            <div className="flex flex-wrap gap-2">
              {jobApps.map((a) => {
                const on = ids.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    disabled={!on && ids.length >= MAX_COMPARE}
                    onClick={() => toggle(a.id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40',
                      on ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium' : 'border-line hover:border-line-strong text-ink-soft',
                    )}
                  >
                    {candidateName(a.candidateId)}
                  </button>
                )
              })}
              {!jobApps.length && <p className="text-muted text-sm">No applicants for this vacancy yet.</p>}
            </div>
          </fieldset>
        )}
      </div>

      {!job || columns.length < 2 ? (
        <EmptyState
          icon={Columns3}
          title={job ? 'Select at least two applicants' : 'Choose a vacancy to start'}
          description="Comparisons are only made within one vacancy so every candidate is measured against the same requirements."
        />
      ) : (
        <>
          <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm dark:border-sky-900 dark:bg-sky-950/30">
            <h2 className="text-ink mb-1 flex items-center gap-2 font-semibold">
              <Info size={15} aria-hidden /> What the evidence shows
            </h2>
            {notes.length ? (
              <ul className="text-ink-soft list-disc space-y-1 pl-5">
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-soft">No notable differences on the recorded data.</p>
            )}
            <p className="text-muted mt-2 text-xs">
              Generated from recorded skills, assessments and submitted scorecards only. It does not rank candidates or make a hiring decision.
            </p>
          </section>

          <div className="border-line/80 bg-surface overflow-x-auto rounded-2xl border">
            <table className="w-full border-collapse">
              <caption className="sr-only">Comparison of selected applicants for {job.title}</caption>
              <thead>
                <tr>
                  <td className="bg-surface sticky left-0" />
                  {columns.map((c) => (
                    <th key={c.application.id} scope="col" className="px-4 py-3 text-left">
                      <div className="flex items-center gap-2">
                        <Avatar name={`${c.candidate.firstName} ${c.candidate.lastName}`} size="sm" />
                        <Link to={`/candidates/${c.candidate.id}`} className="text-ink min-w-0 truncate text-sm font-semibold hover:underline">
                          {c.candidate.firstName} {c.candidate.lastName}
                        </Link>
                        <Button
                          size="xs"
                          variant="ghost"
                          iconOnly
                          icon={X}
                          aria-label={`Remove ${c.candidate.firstName} from comparison`}
                          onClick={() => toggle(c.application.id)}
                          className="ml-auto"
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row
                  label="Current role"
                  columns={columns}
                  render={(c) => `${c.candidate.currentTitle || '—'}${c.candidate.currentCompany ? ` · ${c.candidate.currentCompany}` : ''}`}
                />
                <Row
                  label={`Experience (${job.experienceMin}–${job.experienceMax} yrs)`}
                  columns={columns}
                  render={(c) => (
                    <span className="flex items-center gap-2">
                      {c.candidate.experienceYears} yrs <StatusBadge tone={FIT[c.experienceFit].tone}>{FIT[c.experienceFit].label}</StatusBadge>
                    </span>
                  )}
                />
                <Row
                  label={`Required skills (${job.skills.length})`}
                  columns={columns}
                  render={(c) => (
                    <ul className="space-y-0.5">
                      {job.skills.map((s) => {
                        const ok = c.matchedSkills.includes(s)
                        return (
                          <li key={s} className={cn('flex items-center gap-1.5 text-xs', ok ? 'text-ink' : 'text-muted')}>
                            {ok ? <Check size={13} className="text-emerald-600" aria-label="Listed" /> : <Minus size={13} aria-label="Not listed" />} {s}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                />
                <Row
                  label="Education"
                  columns={columns}
                  render={(c) =>
                    c.candidate.education.length ? (
                      <ul className="space-y-1 text-xs">
                        {c.candidate.education.map((e) => (
                          <li key={e.id}>
                            {e.degree} <span className="text-muted">· {e.institution}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted">Not recorded</span>
                    )
                  }
                />
                <Row
                  label="Assessments"
                  columns={columns}
                  render={(c) =>
                    c.assessments.length ? (
                      <ul className="space-y-1 text-xs">
                        {c.assessments.map((a, i) => (
                          <li key={i}>
                            {a.name}:{' '}
                            {a.score !== null ? (
                              <span className={cn('font-medium', a.passed === false ? 'text-red-700' : 'text-ink')}>
                                {a.score}% {a.passed !== null && `(${a.passed ? 'pass' : 'below'} ${a.passMark}%)`}
                              </span>
                            ) : (
                              <span className="text-muted">{a.status.replace('-', ' ')}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted">None assigned</span>
                    )
                  }
                />
                {criteria.map((crit) => (
                  <Row
                    key={crit}
                    label={crit}
                    columns={columns}
                    render={(c) => {
                      const s = c.criteria.find((k) => k.name === crit)
                      return s?.average != null ? (
                        <span className="flex items-center gap-2">
                          <span className="bg-subtle h-1.5 w-20 overflow-hidden rounded-full" aria-hidden>
                            <span className="bg-brand-500 block h-full" style={{ width: `${(s.average / 5) * 100}%` }} />
                          </span>
                          <span className="tabular">{s.average.toFixed(1)}/5</span>
                          <span className="text-muted text-xs">
                            ({s.ratings} rating{s.ratings === 1 ? '' : 's'})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted">Not rated</span>
                      )
                    }}
                  />
                ))}
                <Row
                  label="Panel recommendations"
                  columns={columns}
                  render={(c) =>
                    c.recommendations.total ? (
                      <span>
                        {c.recommendations.positive}/{c.recommendations.total} advance
                        {c.pendingFeedback > 0 && <span className="text-muted text-xs"> · {c.pendingFeedback} pending</span>}
                      </span>
                    ) : (
                      <span className="text-muted">{c.pendingFeedback ? `${c.pendingFeedback} scorecard(s) pending` : 'No interviews yet'}</span>
                    )
                  }
                />
                <Row label="Notice period" columns={columns} render={(c) => c.candidate.noticePeriod || '—'} />
                <Row
                  label="Expected salary"
                  columns={columns}
                  render={(c) => (c.candidate.expectedSalary ? `₹${c.candidate.expectedSalary.toLocaleString('en-IN')}` : '—')}
                />
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
