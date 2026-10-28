import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, ClipboardList, FileSearch, ListChecks, Mail, MessageSquareQuote, SendHorizonal, Sparkles, Target, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { Field, Select, Textarea } from '@/components/ui/FormControls'
import AIMessage from './AIMessage'
import { useAI } from '@/features/ai/hooks/useAI'
import { useCollection, fullName } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import { AI_TOOLS, EMAIL_PURPOSES } from '@/features/ai/aiService'
import { cn } from '@/utils/cn'

const TOOL_ICONS = {
  resume: FileSearch,
  match: Target,
  'interview-q': ListChecks,
  'assessment-q': ClipboardList,
  feedback: MessageSquareQuote,
  email: Mail,
  funnel: BarChart3,
}

const SUGGESTIONS = [
  'Where is our hiring funnel losing candidates?',
  'Summarise interview feedback for this candidate',
  'Draft an interview invitation email',
  'Suggest interview questions for this role',
]

/** AI-assisted recruiting workspace: context selection, task shortcuts and a chat thread. */
export default function AIAssistant({ initialCandidateId = '', initialJobId = '' }) {
  const candidates = useCollection('candidates')
  const jobs = useCollection('jobs')
  const applications = useCollection('applications')
  const { user } = useSession()
  const ai = useAI()
  const [candidateId, setCandidateId] = useState(initialCandidateId)
  const [jobId, setJobId] = useState(initialJobId)
  const [stageName, setStageName] = useState('')
  const [purpose, setPurpose] = useState('interview-invite')
  const [text, setText] = useState('')
  const threadRef = useRef(null)

  // Follow deep links (e.g. "Ask AI" from a profile) even when the page is already open.
  useEffect(() => {
    if (initialCandidateId) setCandidateId(initialCandidateId)
  }, [initialCandidateId])
  useEffect(() => {
    if (initialJobId) setJobId(initialJobId)
  }, [initialJobId])

  const candidateOptions = useMemo(
    () => [...candidates].sort((a, b) => fullName(a).localeCompare(fullName(b))).map((c) => ({ value: c.id, label: `${fullName(c)} · ${c.ref}` })),
    [candidates],
  )
  // When a candidate is selected, list their vacancies first.
  const jobOptions = useMemo(() => {
    const applied = new Set(applications.filter((a) => a.candidateId === candidateId).map((a) => a.jobId))
    return [...jobs]
      .sort((a, b) => Number(applied.has(b.id)) - Number(applied.has(a.id)))
      .map((j) => ({ value: j.id, label: `${applied.has(j.id) ? '● ' : ''}${j.title}` }))
  }, [jobs, applications, candidateId])
  const job = jobs.find((j) => j.id === jobId)
  const stageOptions = job ? job.stages.filter((s) => s.type === 'interview').map((s) => ({ value: s.name, label: s.name })) : []

  useEffect(() => {
    setStageName(stageOptions[0]?.value ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  // Auto-select the candidate's latest vacancy when only a candidate is chosen.
  useEffect(() => {
    if (!candidateId || jobId) return
    const latest = applications.filter((a) => a.candidateId === candidateId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]
    if (latest) setJobId(latest.jobId)
  }, [candidateId, jobId, applications])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [ai.messages])

  const context = { candidateId, jobId, stageName, purpose, senderName: user.name }

  const missing = (tool) => tool.needs.filter((n) => (n === 'candidate' ? !candidateId : n === 'job' ? !jobId : false))

  const send = (e) => {
    e?.preventDefault()
    const value = text.trim()
    if (!value || ai.busy) return
    ai.sendMessage(value, context)
    setText('')
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="border-line/80 bg-surface shadow-card space-y-5 rounded-2xl border p-4 lg:self-start">
        <div>
          <h2 className="text-sm font-semibold">Context</h2>
          <p className="text-muted text-xs">Responses use only the records you select.</p>
        </div>
        <Field label="Candidate">
          {(a) => (
            <Select {...a} value={candidateId} onChange={(e) => setCandidateId(e.target.value)} options={candidateOptions} placeholder="Select candidate" />
          )}
        </Field>
        <Field label="Vacancy" hint={candidateId ? '● marks vacancies this candidate applied to' : undefined}>
          {(a) => <Select {...a} value={jobId} onChange={(e) => setJobId(e.target.value)} options={jobOptions} placeholder="Select vacancy" />}
        </Field>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Field label="Interview round">
            {(a) => (
              <Select
                {...a}
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                options={stageOptions}
                placeholder={job ? 'No interview stages' : 'Select vacancy'}
                disabled={!stageOptions.length}
              />
            )}
          </Field>
          <Field label="Email type">{(a) => <Select {...a} value={purpose} onChange={(e) => setPurpose(e.target.value)} options={EMAIL_PURPOSES} />}</Field>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Tasks</h2>
          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
            {AI_TOOLS.map((tool) => {
              const Icon = TOOL_ICONS[tool.id]
              const needs = missing(tool)
              return (
                <li key={tool.id}>
                  <button
                    type="button"
                    disabled={ai.busy || needs.length > 0}
                    onClick={() => ai.runTool(tool.id, context)}
                    title={needs.length ? `Select a ${needs.join(' and ')} first` : undefined}
                    className="hover:bg-subtle flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Icon size={15} className="text-brand-600 shrink-0" aria-hidden />
                    <span className="flex-1">{tool.label}</span>
                    {needs.length > 0 && <span className="text-faint text-[10px]">needs {needs.join(' + ')}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <p className="bg-subtle text-muted rounded-lg px-3 py-2 text-xs leading-relaxed">
          The assistant suggests and summarises. It never rejects candidates, changes stages or makes hiring decisions.
        </p>
      </aside>

      <section className="border-line/80 bg-surface shadow-card flex min-h-[70dvh] flex-col rounded-2xl border" aria-label="Assistant conversation">
        <header className="border-line flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand-600" aria-hidden />
            <h2 className="text-sm font-semibold">Assistant</h2>
          </div>
          <Button size="xs" variant="ghost" icon={Trash2} onClick={ai.clear} disabled={!ai.messages.length || ai.busy}>
            Clear
          </Button>
        </header>

        <div ref={threadRef} className="flex-1 scrollbar-thin space-y-5 overflow-y-auto p-4" style={{ maxHeight: '62dvh' }}>
          {ai.messages.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="How can I help with hiring today?"
              description="Pick a task on the left or describe what you need. Every answer shows the records it was based on."
              action={
                <div className="flex max-w-xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ai.sendMessage(s, context)}
                      className="border-line text-ink-soft hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 rounded-lg border px-3 py-1.5 text-xs"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              }
            />
          ) : (
            ai.messages.map((m) => <AIMessage key={m.id} message={m} onRetry={ai.retry} onSaveEdit={ai.updateResponse} />)
          )}
        </div>

        <form onSubmit={send} className="border-line border-t p-3">
          <div
            className={cn(
              'bg-surface focus-within:border-brand-500 focus-within:ring-brand-100 flex items-end gap-2 rounded-xl border p-2 transition-colors focus-within:ring-3',
              'border-line-strong',
            )}
          >
            <label htmlFor="ai-input" className="sr-only">
              Message the assistant
            </label>
            <Textarea
              id="ai-input"
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) send(e)
              }}
              placeholder="Ask about a candidate, vacancy or your funnel…"
              className="max-h-40 min-h-9 resize-none border-0 px-2 py-1.5 shadow-none focus:ring-0"
            />
            <Button type="submit" variant="primary" iconOnly icon={SendHorizonal} aria-label="Send" disabled={!text.trim() || ai.busy} loading={ai.busy} />
          </div>
          <p className="text-faint mt-1.5 px-1 text-[11px]">Simulated mode: responses are generated locally from demo data — no AI model is connected.</p>
        </form>
      </section>
    </div>
  )
}
