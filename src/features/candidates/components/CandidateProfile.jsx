import { useState } from 'react'
import { Briefcase, Download, Eye, FileText, GraduationCap, Languages, Lock, Mail, MapPin, Phone, RefreshCw, Timer, Wallet } from 'lucide-react'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import FileDropzone from '@/components/ui/FileDropzone'
import MockNotice from '@/components/ui/MockNotice'
import Modal from '@/components/ui/Modal'
import { Select, Textarea } from '@/components/ui/FormControls'
import { fileStorage } from '@/services/storage/fileStorage'
import { useCandidateActions } from '@/features/candidates/hooks/useCandidates'
import { useLookups } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
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
      <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">{children}</h3>
      {action}
    </div>
  )
}

export function ContactDetails({ candidate }) {
  const { usersById } = useLookups()
  const rows = [
    {
      icon: Mail,
      label: 'Email',
      value: (
        <a href={`mailto:${candidate.email}`} className="hover:text-brand-700 hover:underline">
          {candidate.email}
        </a>
      ),
    },
    {
      icon: Phone,
      label: 'Phone',
      value: candidate.phone ? (
        <a href={`tel:${candidate.phone.replace(/\s/g, '')}`} className="hover:underline">
          {candidate.phone}
        </a>
      ) : (
        '—'
      ),
    },
    { icon: MapPin, label: 'Location', value: candidate.location || '—' },
    { icon: Timer, label: 'Notice period', value: candidate.noticePeriod },
    { icon: Wallet, label: 'Expected CTC', value: candidate.expectedSalary ? `₹${candidate.expectedSalary.toLocaleString('en-IN')}` : '—' },
    { icon: Briefcase, label: 'Recruiter', value: usersById.get(candidate.recruiterId)?.name ?? '—' },
  ]
  return (
    <dl className="space-y-2.5 text-sm">
      {rows.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-start gap-3">
          <Icon size={15} className="text-faint mt-0.5 shrink-0" aria-hidden />
          <dt className="sr-only">{label}</dt>
          <dd className="text-ink-soft min-w-0 flex-1 break-words">
            <span className="text-xxs text-faint block">{label}</span>
            {value}
          </dd>
        </div>
      ))}
      <div className="flex items-start gap-3">
        <span className="w-[15px]" />
        <dd className="text-muted text-xs">
          Source: {candidate.source} · Added {formatDate(candidate.createdAt)}
        </dd>
      </div>
    </dl>
  )
}

export function SkillsList({ skills, highlight = [] }) {
  if (!skills.length) return <p className="text-muted text-sm">No skills recorded.</p>
  const hl = new Set(highlight.map((s) => s.toLowerCase()))
  return (
    <ul className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <li
          key={s}
          className={
            hl.has(s.toLowerCase())
              ? 'bg-brand-50 text-brand-800 rounded-md px-2 py-1 text-xs font-medium'
              : 'bg-subtle text-ink-soft rounded-md px-2 py-1 text-xs'
          }
        >
          {s}
        </li>
      ))}
    </ul>
  )
}

export function ExperienceList({ experience }) {
  if (!experience.length) return <p className="text-muted text-sm">No prior work experience listed.</p>
  return (
    <ol className="space-y-4">
      {experience.map((e) => (
        <li key={e.id} className="flex gap-3">
          <Avatar name={e.company} size="sm" className="rounded-md!" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{e.title}</p>
            <p className="text-muted text-xs">
              {e.company} · {e.start} – {e.end}
            </p>
            {e.summary && <p className="text-ink-soft mt-1 text-sm leading-relaxed">{e.summary}</p>}
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
            <GraduationCap size={16} className="text-faint mt-0.5" aria-hidden />
            <div>
              <p className="text-sm font-medium">{e.degree}</p>
              <p className="text-muted text-xs">{[e.institution, e.year].filter(Boolean).join(' · ') || '—'}</p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-muted text-sm">No education recorded.</p>
      )}
      {languages.length > 0 && (
        <div className="flex items-start gap-3">
          <Languages size={16} className="text-faint mt-0.5" aria-hidden />
          <p className="text-ink-soft text-sm">{languages.join(', ')}</p>
        </div>
      )}
    </div>
  )
}

/** Resume with secure preview/download (signed URL or local blob) and replace. */
export function ResumeSection({ candidate }) {
  const actions = useCandidateActions()
  const toast = useToast()
  const { can, mode } = useSession()
  const [replacing, setReplacing] = useState(false)
  const [preview, setPreview] = useState(null)
  const { resume } = candidate

  const open = async (kind) => {
    try {
      const url = await fileStorage.url(resume)
      if (kind === 'download') {
        const a = document.createElement('a')
        a.href = url
        a.download = resume.fileName
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        setPreview(url)
      }
    } catch (e) {
      toast.info(e.message, 'File unavailable')
    }
  }

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
        {actions.attachResume.pending && <p className="text-muted text-xs">Uploading…</p>}
        {replacing && (
          <Button size="sm" variant="ghost" onClick={() => setReplacing(false)}>
            Cancel
          </Button>
        )}
      </div>
    )
  }

  const previewable = /\.pdf$/i.test(resume.fileName)
  return (
    <div className="space-y-2">
      <div className="border-line flex items-center gap-3 rounded-lg border px-3 py-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-red-50 text-red-600">
          <FileText size={17} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{resume.fileName}</p>
          <p className="text-muted text-xs">
            {formatFileSize(resume.size)} · uploaded {formatRelative(resume.uploadedAt)}
          </p>
        </div>
        {previewable && <Button size="sm" variant="ghost" iconOnly icon={Eye} aria-label="Preview resume" onClick={() => open('preview')} />}
        <Button size="sm" variant="ghost" iconOnly icon={Download} aria-label="Download resume" onClick={() => open('download')} />
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon={RefreshCw}
          aria-label="Replace resume"
          disabled={!can('candidates.manage')}
          onClick={() => setReplacing(true)}
        />
      </div>
      {mode === 'demo' && !resume.fileId && <MockNotice>Sample record: only the file name is stored. Upload a file to try preview and download.</MockNotice>}
      {mode === 'supabase' && <p className="text-faint text-xxs">Stored privately; links expire after 5 minutes.</p>}
      <Modal
        open={Boolean(preview)}
        onClose={() => {
          URL.revokeObjectURL(preview)
          setPreview(null)
        }}
        size="xl"
        title={resume.fileName}
        bodyClassName="p-0"
      >
        {preview && <iframe title={`Preview of ${resume.fileName}`} src={preview} className="h-[70dvh] w-full" sandbox="allow-same-origin" />}
      </Modal>
    </div>
  )
}

/**
 * Recruiter notes. `@Full Name` mentions notify teammates; restricted notes are
 * visible to Admins and Recruiters only (enforced by RLS in Supabase mode).
 */
export function NotesSection({ candidate, limit }) {
  const { usersById } = useLookups()
  const { can } = useSession()
  const actions = useCandidateActions()
  const [text, setText] = useState('')
  const [visibility, setVisibility] = useState('team')
  const [error, setError] = useState(null)
  const canRestricted = can('candidates.notes.restricted')
  const visible = candidate.notes.filter((n) => n.visibility !== 'restricted' || canRestricted)
  const notes = limit ? visible.slice(0, limit) : visible
  const hidden = candidate.notes.length - visible.length

  const submit = async (e) => {
    e.preventDefault()
    if (text.trim().length < 3) {
      setError('Write at least a few characters')
      return
    }
    const res = await actions.addNote.run(candidate.id, text, visibility)
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
          placeholder="Add a note… type @Full Name to notify a teammate"
          invalid={!!error}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-red-600" role="alert">
            {error}
          </span>
          <div className="flex items-center gap-2">
            {canRestricted && (
              <Select
                aria-label="Note visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                options={[
                  { value: 'team', label: 'Visible to hiring team' },
                  { value: 'restricted', label: 'Restricted (recruiters & admins)' },
                ]}
                className="h-8! text-xs"
              />
            )}
            <Button size="sm" type="submit" loading={actions.addNote.pending} disabled={!text.trim()}>
              Add note
            </Button>
          </div>
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
                  <p className="text-muted flex items-center gap-1.5 text-xs">
                    <span className="text-ink font-medium">{author?.name ?? 'Team member'}</span> · {formatRelative(n.at)}
                    {n.visibility === 'restricted' && (
                      <span className="inline-flex items-center gap-0.5 text-amber-700">
                        <Lock size={11} aria-hidden /> restricted
                      </span>
                    )}
                  </p>
                  <p className="text-ink-soft mt-0.5 text-sm leading-relaxed whitespace-pre-line">{n.text}</p>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState compact title="No notes yet" description="Capture context from calls and interviews for the hiring team." />
      )}
      {hidden > 0 && <p className="text-faint text-xs">{hidden} restricted note(s) hidden for your role.</p>}
    </div>
  )
}
