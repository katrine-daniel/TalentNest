import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, Copy, FileSearch, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import StatusBadge from '@/components/ui/StatusBadge'
import { Input, Textarea } from '@/components/ui/FormControls'
import { Skeleton } from '@/components/ui/LoadingState'
import { useToast } from '@/components/ui/Toast'
import ResumeInsights from './ResumeInsights'
import SkillMatchPanel from './SkillMatchPanel'
import { RECOMMENDATIONS } from '@/features/interviews/components/FeedbackSummary'
import { formatDate } from '@/utils/formatDate'

function QuestionsView({ data, editing, draft, setDraft }) {
  if (editing) {
    return (
      <div className="space-y-2">
        {draft.items.map((q, i) => (
          <div key={q.id} className="flex gap-2">
            <Textarea
              aria-label={`Question ${i + 1}`}
              rows={2}
              value={q.question}
              onChange={(e) => setDraft({ items: draft.items.map((x) => (x.id === q.id ? { ...x, question: e.target.value } : x)) })}
            />
            <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Remove question ${i + 1}`} onClick={() => setDraft({ items: draft.items.filter((x) => x.id !== q.id) })} />
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => setDraft({ items: [...draft.items, { id: `q-${Date.now()}`, question: '', focus: 'Custom', lookFor: '' }] })}>
          Add question
        </Button>
      </div>
    )
  }
  return (
    <ol className="space-y-3">
      {data.items.map((q, i) => (
        <li key={q.id} className="flex gap-3 text-sm">
          <span className="w-5 shrink-0 text-xs font-medium text-faint tabular">{i + 1}.</span>
          <div>
            <p className="text-ink">{q.question}</p>
            {(q.focus || q.lookFor) && (
              <p className="mt-0.5 text-xs text-muted">
                {q.focus && <span className="font-medium text-brand-700">{q.focus}</span>}
                {q.lookFor && ` — look for: ${q.lookFor}`}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

function EmailView({ data, editing, draft, setDraft }) {
  if (editing) {
    return (
      <div className="space-y-2">
        <Input aria-label="Email subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
        <Textarea aria-label="Email body" rows={10} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-line text-sm">
      <div className="space-y-0.5 border-b border-line px-3 py-2 text-xs">
        <p>
          <span className="text-muted">To:</span> {data.to}
        </p>
        <p>
          <span className="text-muted">Subject:</span> <span className="font-medium">{data.subject}</span>
        </p>
      </div>
      <p className="px-3 py-3 leading-relaxed whitespace-pre-line text-ink-soft">{data.body}</p>
    </div>
  )
}

function FeedbackView({ data }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{data.overview}</p>
      <ul className="space-y-2">
        {data.entries.map((e) => {
          const rec = RECOMMENDATIONS.find((r) => r.value === e.recommendation)
          return (
            <li key={e.id} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.stage}</span>
                <span className="text-xs text-muted">· {e.interviewer}</span>
                <StatusBadge tone={rec?.tone}>{rec?.label}</StatusBadge>
                <span className="ml-auto text-xs text-muted tabular">avg {e.average}/5</span>
              </div>
              <p className="mt-1.5 text-xs">
                <span className="font-medium text-emerald-700">+</span> {e.strengths}
              </p>
              <p className="text-xs">
                <span className="font-medium text-red-600">−</span> {e.concerns}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function FunnelView({ data }) {
  return (
    <ul className="space-y-3">
      {data.insights.map((i) => (
        <li key={i.headline} className="text-sm">
          <p className="font-medium text-ink">{i.headline}</p>
          <p className="mt-0.5 text-xs text-muted">Evidence: {i.evidence}</p>
          <p className="mt-0.5 text-xs text-brand-700">Suggestion: {i.suggestion}</p>
        </li>
      ))}
    </ul>
  )
}

function toPlainText(response) {
  const { kind, data } = response
  if (kind === 'email') return `Subject: ${data.subject}\n\n${data.body}`
  if (kind === 'questions') return data.items.map((q, i) => `${i + 1}. ${q.question}`).join('\n')
  if (kind === 'funnel') return data.insights.map((i) => `• ${i.headline}\n  ${i.suggestion}`).join('\n')
  if (kind === 'feedbackSummary') return [data.overview, ...data.entries.map((e) => `${e.stage} (${e.interviewer}): ${e.recommendation}. + ${e.strengths} − ${e.concerns}`)].join('\n')
  if (kind === 'skillMatch') return [`Match ${data.score}%`, ...data.rows.map((r) => `${r.skill}: ${r.level} — ${r.evidence}`)].join('\n')
  if (kind === 'resume') return [data.name, data.currentRole, `${data.experienceYears} yrs`, `Skills: ${data.skills.join(', ')}`].join('\n')
  return data.text ?? ''
}

/** One message in the assistant thread (user prompt or simulated assistant response). */
export default function AIMessage({ message, onRetry, onSaveEdit }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [showSources, setShowSources] = useState(false)

  if (message.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2 text-sm text-white">{message.text}</p>
      </motion.div>
    )
  }

  const { status, response, error } = message

  return (
    <motion.article initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3" aria-live="polite" aria-busy={status === 'loading'}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Sparkles size={14} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl border border-line/80 bg-surface shadow-card">
        {status === 'loading' && (
          <div className="space-y-2.5 p-4" role="status">
            <p className="text-xs text-muted">Preparing simulated response…</p>
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" role="alert">
            <AlertTriangle size={16} className="shrink-0 text-amber-600" aria-hidden />
            <p className="flex-1 text-sm text-ink-soft">{error}</p>
            <Button size="sm" icon={RotateCcw} onClick={() => onRetry(message.id)}>
              Retry
            </Button>
          </div>
        )}

        {status === 'done' && response && (
          <>
            <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{response.title}</h3>
              <StatusBadge tone="neutral" dot={false}>
                Simulated
              </StatusBadge>
              {response.edited && (
                <StatusBadge tone="brand" dot={false}>
                  Edited
                </StatusBadge>
              )}
            </header>
            <div className="p-4">
              {response.kind === 'resume' && <ResumeInsights data={response.data} />}
              {response.kind === 'skillMatch' && <SkillMatchPanel data={response.data} />}
              {response.kind === 'questions' && <QuestionsView data={response.data} editing={editing} draft={draft} setDraft={setDraft} />}
              {response.kind === 'email' && <EmailView data={response.data} editing={editing} draft={draft} setDraft={setDraft} />}
              {response.kind === 'feedbackSummary' && <FeedbackView data={response.data} />}
              {response.kind === 'funnel' && <FunnelView data={response.data} />}
              {response.kind === 'text' && <p className="text-sm leading-relaxed text-ink-soft">{response.data.text}</p>}
              {response.caveat && <p className="mt-3 rounded-md bg-subtle px-3 py-2 text-xs text-muted">{response.caveat}</p>}
            </div>
            <footer className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-1.5">
              {response.sources?.length > 0 && (
                <Button size="xs" variant="ghost" icon={FileSearch} onClick={() => setShowSources((s) => !s)} aria-expanded={showSources}>
                  Sources ({response.sources.length})
                </Button>
              )}
              <span className="flex-1" />
              {editing ? (
                <>
                  <Button size="xs" variant="ghost" icon={X} onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="xs"
                    variant="primary"
                    icon={Check}
                    onClick={() => {
                      onSaveEdit(message.id, draft)
                      setEditing(false)
                    }}
                  >
                    Save edits
                  </Button>
                </>
              ) : (
                <>
                  {response.editable && (
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={Pencil}
                      onClick={() => {
                        setDraft(response.kind === 'email' ? { subject: response.data.subject, body: response.data.body } : { items: response.data.items })
                        setEditing(true)
                      }}
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={Copy}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(toPlainText(response))
                        toast.success('Copied to clipboard')
                      } catch {
                        toast.error('Clipboard access was blocked by the browser.')
                      }
                    }}
                  >
                    Copy
                  </Button>
                  <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => onRetry(message.id)}>
                    Regenerate
                  </Button>
                </>
              )}
            </footer>
            {showSources && (
              <ul className="space-y-1 border-t border-line bg-subtle/50 px-4 py-3 text-xs">
                {response.sources.map((s) => (
                  <li key={s.label}>
                    <span className="font-medium text-ink">{s.label}</span>
                    {s.detail && <span className="text-muted"> — {s.detail}</span>}
                  </li>
                ))}
                <li className="pt-1 text-faint">Generated locally from TalentNest demo records on {formatDate(new Date())}.</li>
              </ul>
            )}
          </>
        )}
      </div>
    </motion.article>
  )
}
