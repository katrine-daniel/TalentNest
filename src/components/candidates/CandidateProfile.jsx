import { useState } from 'react'
import { Briefcase, Download, FileText, GraduationCap, Languages, Mail, MapPin, Phone, RefreshCw, Timer, Wallet } from 'lucide-react'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import FileDropzone from '@/components/ui/FileDropzone'
import MockNotice from '@/components/ui/MockNotice'
import { Textarea } from '@/components/ui/FormControls'
import { useCandidateActions } from '@/hooks/useCandidates'
import { useLookups } from '@/hooks/useStore'
import { useSession } from '@/context/SessionContext'
import { useToast } from '@/components/ui/Toast'
import { formatDate, formatRelative } from '@/utils/formatDate'
import { formatFileSize } from '@/utils/validation'

/*
 * Building blocks of a candidate profile. The full profile page and the quick-view
 * drawer compose the same sections, so each is implemented once.
 */

export function SectionTitle({ children, action }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{children}</h3>
      {action}
    </div>
  )
}

export function ContactDetails({ candidate }) {
  const { usersById } = useLookups()
  const rows = [
    { icon: Mail, label: 'Email', value: <a href={`mailto:${candidate.email}`} className="hover:text-brand-700 hover:underline">{candidate.email}</a> },
    { icon: Phone, label: 'Phone', value: candidate.phone ? <a href={`tel:${candidate.phone.replace(/\s/g, '')}`} className="hover:underline">{candidate.phone}</a> : '—' },
    { icon: MapPin, label: 'Location', value: candidate.location || '—' },
    { icon: Timer, label: 'Notice period', value: candidate.noticePeriod },
    { icon: Wallet, label: 'Expected CTC', value: candidate.expectedSalary ? `₹${candidate.expectedSalary.toLocaleString('en-IN')}` : '—' },
    { icon: Briefcase, label: 'Recruiter', value: usersById.get(candidate.recruiterId)?.name ?? '—' },
  ]
  return (
    <dl className="space-y-2.5 text-sm">
      {rows.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-start gap-3">
          <Icon size={15} className="mt-0.5 shrink-0 text-faint" aria-hidden />
          <dt className="sr-only">{label}</dt>
          <dd className="min-w-0 flex-1 break-words text-ink-soft">
            <span className="block text-xxs text-faint">{label}</span>
            {value}
          </dd>
        </div>
      ))}
      <div className="flex items-start gap-3">
        <span className="w-[15px]" />
        <dd className="text-xs text-muted">
          Source: {candidate.source} · Added {formatDate(candidate.createdAt)}
        </dd>
      </div>
    </dl>
  )
}

export function SkillsList({ skills, highlight = [] }) {
  if (!skills.length) return <p className="text-sm text-muted">No skills recorded.</p>
  const hl = new Set(highlight.map((s) => s.toLowerCase()))
  return (
    <ul className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <li key={s} className={hl.has(s.toLowerCase()) ? 'rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800' : 'rounded-md bg-subtle px-2 py-1 text-xs text-ink-soft'}>
          {s}
        </li>
      ))}
    </ul>
  )
}

export function ExperienceList({ experience }) {
  if (!experience.length) return <p className="text-sm text-muted">No prior work experience listed.</p>
  return (
    <ol className="space-y-4">
      {experience.map((e) => (
        <li key={e.id} className="flex gap-3">
          <Avatar name={e.company} size="sm" className="rounded-md!" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{e.title}</p>
            <p className="text-xs text-muted">
              {e.company} · {e.start} – {e.end}
            </p>
            {e.summary && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{e.summary}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function EducationList({ education, languages = [] }) {
  return (
    <div className="space-y-3">
      {education.length ? (
        education.map((e) => (
          <div key={e.id} className="flex items-start gap-3">
            <GraduationCap size={16} className="mt-0.5 text-faint" aria-hidden />
            <div>
              <p className="text-sm font-medium">{e.degree}</p>
              <p className="text-xs text-muted">{[e.institution, e.year].filter(Boolean).join(' · ') || '—'}</p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted">No education recorded.</p>
      )}
      {languages.length > 0 && (
        <div className="flex items-start gap-3">
          <Languages size={16} className="mt-0.5 text-faint" aria-hidden />
          <p className="text-sm text-ink-soft">{languages.join(', ')}</p>
        </div>
      )}
    </div>
  )
}

export function ResumeSection({ candidate }) {
  const actions = useCandidateActions()
  const toast = useToast()
  const { can } = useSession()
  const [replacing, setReplacing] = useState(false)
  const { resume } = candidate

  if (!resume || replacing) {
    return (
      <div className="space-y-2">
        <FileDropzone
          file={null}
          disabled={!can('candidates.manage') || actions.attachResume.pending}
          onFile={async (file) => {
            const res = await actions.attachResume.run(candidate.id, file)
            if (res.ok) setReplacing(false)
          }}
        />
        {actions.attachResume.pending && <p className="text-xs text-muted">Uploading…</p>}
        {replacing && (
          <Button size="sm" variant="ghost" onClick={() => setReplacing(false)}>
            Cancel
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-red-50 text-red-600">
          <FileText size={17} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{resume.fileName}</p>
          <p className="text-xs text-muted">
            {formatFileSize(resume.size)} · uploaded {formatRelative(resume.uploadedAt)}
          </p>
        </div>
        <Button size="sm" variant="ghost" iconOnly icon={Download} aria-label="Download resume" onClick={() => toast.info('File storage is not connected in demo mode, so only resume metadata is available.', 'Download unavailable')} />
        <Button size="sm" variant="ghost" iconOnly icon={RefreshCw} aria-label="Replace resume" disabled={!can('candidates.manage')} onClick={() => setReplacing(true)} />
      </div>
      <MockNotice>Demo storage keeps file metadata only.</MockNotice>
    </div>
  )
}

export function NotesSection({ candidate, limit }) {
  const { usersById } = useLookups()
  const actions = useCandidateActions()
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const notes = limit ? candidate.notes.slice(0, limit) : candidate.notes

  const submit = async (e) => {
    e.preventDefault()
    if (text.trim().length < 3) {
      setError('Write at least a few characters')
      return
    }
    const res = await actions.addNote.run(candidate.id, text)
    if (res.ok) {
      setText('')
      setError(null)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor={`note-${candidate.id}`} className="sr-only">
          Add a recruiter note
        </label>
        <Textarea
          id={`note-${candidate.id}`}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (error) setError(null)
          }}
          rows={2}
          placeholder="Add a note visible to the hiring team…"
          invalid={!!error}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-red-600" role="alert">
            {error}
          </span>
          <Button size="sm" type="submit" loading={actions.addNote.pending} disabled={!text.trim()}>
            Add note
          </Button>
        </div>
      </form>
      {notes.length ? (
        <ul className="space-y-3">
          {notes.map((n) => {
            const author = usersById.get(n.authorId)
            return (
              <li key={n.id} className="flex gap-3">
                <Avatar name={author?.name ?? 'Team'} size="xs" className="mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    <span className="font-medium text-ink">{author?.name ?? 'Team member'}</span> · {formatRelative(n.at)}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{n.text}</p>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState compact title="No notes yet" description="Capture context from calls and interviews for the hiring team." />
      )}
    </div>
  )
}
