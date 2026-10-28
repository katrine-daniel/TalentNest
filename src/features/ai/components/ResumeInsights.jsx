import { SkillsList } from '@/features/candidates/components/CandidateProfile'

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
          <div key={k} className="border-line/70 flex justify-between gap-3 border-b pb-1.5">
            <dt className="text-muted">{k}</dt>
            <dd className="text-ink truncate text-right">{v || '—'}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-xxs text-muted mb-1.5 font-semibold tracking-wide uppercase">Skills</p>
        <SkillsList skills={data.skills} />
      </div>
      {data.experience.length > 0 && (
        <div>
          <p className="text-xxs text-muted mb-1.5 font-semibold tracking-wide uppercase">Work history</p>
          <ul className="space-y-1 text-sm">
            {data.experience.map((e) => (
              <li key={e.id}>
                <span className="font-medium">{e.title}</span>, {e.company}{' '}
                <span className="text-muted">
                  ({e.start} – {e.end})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.education.length > 0 && (
        <p className="text-sm">
          <span className="text-xxs text-muted font-semibold tracking-wide uppercase">Education </span>
          {data.education.map((e) => [e.degree, e.institution, e.year].filter(Boolean).join(', ')).join('; ')}
        </p>
      )}
    </div>
  )
}
