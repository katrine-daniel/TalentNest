import { SkillsList } from '@/components/candidates/CandidateProfile'

/** Structured view of extracted resume fields. */
export default function ResumeInsights({ data }) {
  const fields = [
    ['Name', data.name],
    ['Current role', data.currentRole],
    ['Experience', `${data.experienceYears} years`],
    ['Location', data.location],
    ['Notice period', data.noticePeriod],
    ['Email', data.email],
    ['Phone', data.phone],
    ['Languages', data.languages.join(', ')],
  ]
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {fields.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line/70 pb-1.5">
            <dt className="text-muted">{k}</dt>
            <dd className="truncate text-right text-ink">{v || '—'}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="mb-1.5 text-xxs font-semibold tracking-wide text-muted uppercase">Skills</p>
        <SkillsList skills={data.skills} />
      </div>
      {data.experience.length > 0 && (
        <div>
          <p className="mb-1.5 text-xxs font-semibold tracking-wide text-muted uppercase">Work history</p>
          <ul className="space-y-1 text-sm">
            {data.experience.map((e) => (
              <li key={e.id}>
                <span className="font-medium">{e.title}</span>, {e.company} <span className="text-muted">({e.start} – {e.end})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.education.length > 0 && (
        <p className="text-sm">
          <span className="text-xxs font-semibold tracking-wide text-muted uppercase">Education </span>
          {data.education.map((e) => [e.degree, e.institution, e.year].filter(Boolean).join(', ')).join('; ')}
        </p>
      )}
    </div>
  )
}
