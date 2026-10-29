import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Paperclip, X } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { isHR } from '@/domain/permissions'
import type { HRRequest, Priority } from '@/domain/types'
import { cn, fullName } from '@/lib/utils'
import { createRequest, UPDATABLE_FIELDS } from '@/services/requests'
import { MAX_FILE_BYTES } from '@/services/files'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { PageHeader, Panel } from '@/components/ui/Layout'
import { CATEGORY_LABELS } from '@/features/shared/display'

export default function NewRequestPage() {
  const db = useDb()
  const { account } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const hr = isHR(account)
  const types = db.requestTypes.filter((t) => t.active && (t.selfService || hr))
  const [typeId, setTypeId] = useState(params.get('type') && types.some((t) => t.id === params.get('type')) ? (params.get('type') as string) : '')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [employeeId, setEmployeeId] = useState(account.employeeId ?? '')
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [attachments, setAttachments] = useState<File[]>([])
  const [submitted, setSubmitted] = useState(false)
  const type = types.find((t) => t.id === typeId)
  const grouped = useMemo(() => {
    const m = new Map<string, typeof types>()
    for (const t of types) m.set(t.category, [...(m.get(t.category) ?? []), t])
    return [...m.entries()]
  }, [types])
  const submit = useAction(
    () => createRequest(account, { typeId, subject, description, priority: priority || undefined, employeeId, proposedChanges: changes }, attachments),
    (r: HRRequest) => `Request ${r.number} submitted`,
  )

  const errors = {
    subject: !subject.trim() ? 'Add a short subject.' : subject.length > 140 ? 'Keep it under 140 characters.' : null,
    changes: type?.kind === 'record_update' && !Object.values(changes).some((v) => v.trim()) ? 'Enter at least one new value.' : null,
  }

  return (
    <div className="max-w-4xl">
      <Link to="/requests" className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={14} aria-hidden /> Requests
      </Link>
      <PageHeader title="New request" description="Choose what you need. You’ll see who handles it, whether it needs approval, and the response target." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel title="1. What do you need?">
          <div className="space-y-4 p-3">
            {grouped.map(([cat, list]) => (
              <div key={cat}>
                <p className="text-muted px-1 pb-1 text-[11px] font-semibold tracking-wide uppercase">{CATEGORY_LABELS[cat] ?? cat}</p>
                <div role="radiogroup" aria-label={CATEGORY_LABELS[cat]} className="space-y-1">
                  {list.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={typeId === t.id}
                      onClick={() => setTypeId(t.id)}
                      className={cn(
                        'w-full rounded-md border px-3 py-2 text-left transition-colors',
                        typeId === t.id ? 'border-brand-600 bg-brand-50' : 'hover:bg-page border-transparent',
                      )}
                    >
                      <span className="block text-sm font-medium">{t.name}</span>
                      <span className="text-muted block text-xs">{t.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="2. Details">
          {!type ? (
            <p className="text-muted p-5 text-sm">Choose a request type to continue.</p>
          ) : (
            <form
              noValidate
              className="space-y-4 p-5"
              onSubmit={async (e) => {
                e.preventDefault()
                setSubmitted(true)
                if (errors.subject || errors.changes) return
                const r = await submit.run()
                if (r.ok) navigate(`/requests/${r.value.id}`)
              }}
            >
              <div className="bg-page border-line rounded-md border px-3 py-2 text-xs">
                <p>
                  <strong>
                    {type.approvalChain.length ? `Needs ${type.approvalChain.map((s) => s.name.toLowerCase()).join(', then ')}` : 'Handled directly by HR'}
                  </strong>{' '}
                  · response target {type.slaHours} business hours
                </p>
              </div>
              {hr && (
                <Field label="Request is about" hint="HR can raise a request on behalf of an employee.">
                  {(a) => (
                    <Select
                      {...a}
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      options={db.employees
                        .filter((e) => e.status !== 'terminated')
                        .map((e) => ({ value: e.id, label: `${fullName(e)}${e.id === account.employeeId ? ' (me)' : ''}` }))}
                    />
                  )}
                </Field>
              )}
              <Field label="Subject" required error={submitted ? errors.subject : null}>
                {(a) => (
                  <Input
                    {...a}
                    value={subject}
                    maxLength={140}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={type.kind === 'record_update' ? 'e.g. New phone number' : 'One line summary'}
                    data-autofocus
                  />
                )}
              </Field>
              {type.kind === 'record_update' && (
                <fieldset className="space-y-3">
                  <legend className="text-ink-soft mb-1 text-[13px] font-medium">
                    New values {submitted && errors.changes && <span className="text-danger text-xs font-normal">— {errors.changes}</span>}
                  </legend>
                  {Object.entries(UPDATABLE_FIELDS).map(([k, label]) => (
                    <Field key={k} label={label}>
                      {(a) => <Input {...a} value={changes[k] ?? ''} onChange={(e) => setChanges({ ...changes, [k]: e.target.value })} />}
                    </Field>
                  ))}
                  <p className="text-muted text-xs">HR verifies the change; your record is updated automatically once approved.</p>
                </fieldset>
              )}
              <Field label="Description">
                {(a) => <Textarea {...a} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything HR should know" />}
              </Field>
              <Field label="Priority" hint="Leave as default unless it is time-critical.">
                {(a) => (
                  <Select
                    {...a}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    placeholder={`Default (${type.defaultPriority})`}
                    options={['low', 'normal', 'high', 'urgent'].map((p) => ({ value: p, label: p[0]?.toUpperCase() + p.slice(1) }))}
                  />
                )}
              </Field>
              <div>
                <label className="border-line-strong hover:border-brand-600 inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                  <Paperclip size={14} aria-hidden /> Attach files
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    className="sr-only"
                    onChange={(e) => {
                      setAttachments([...attachments, ...Array.from(e.target.files ?? [])].slice(0, 5))
                      e.target.value = ''
                    }}
                  />
                </label>
                <p className="text-muted mt-1 text-xs">Up to 5 files, {MAX_FILE_BYTES / 1024 / 1024} MB each. Stored privately and visible to you and HR.</p>
                {attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attachments.map((f, i) => (
                      <li key={i} className="bg-page flex items-center gap-2 rounded px-2 py-1 text-xs">
                        <span className="flex-1 truncate">{f.name}</span>
                        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}>
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button onClick={() => navigate(-1)}>Cancel</Button>
                <Button type="submit" variant="primary" loading={submit.pending}>
                  Submit request
                </Button>
              </div>
            </form>
          )}
        </Panel>
      </div>
    </div>
  )
}
