import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import type { Policy } from '@/domain/types'
import { today } from '@/lib/dates'
import { createPolicy, latestVersion, savePolicyDraft, type PolicyInput } from '@/services/policies'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Form'
import { PageHeader, Panel } from '@/components/ui/Layout'
import { Markdown } from './Markdown'

export default function PolicyEditorPage() {
  const { policyId } = useParams()
  const db = useDb()
  const { account } = useSession()
  const navigate = useNavigate()
  const existing = policyId ? db.policies.find((p) => p.id === policyId) : undefined
  const latest = existing ? latestVersion(existing) : null
  const newVersion = Boolean(latest?.publishedAt)
  const [form, setForm] = useState<PolicyInput>(() => ({
    title: existing?.title ?? '',
    category: existing?.category ?? '',
    tags: existing?.tags ?? [],
    summary: existing?.summary ?? '',
    body: latest?.body ?? '## Purpose\n\n## Who this applies to\n\n## Policy\n',
    effectiveDate: newVersion ? today() : (latest?.effectiveDate ?? today()),
    changeNote: newVersion ? '' : (latest?.changeNote ?? ''),
    requiresAcknowledgment: existing?.requiresAcknowledgment ?? false,
    audienceDepartmentIds: existing?.audienceDepartmentIds ?? null,
    reviewBy: existing?.reviewBy ?? null,
  }))
  const [preview, setPreview] = useState(false)
  const set = (p: Partial<PolicyInput>) => setForm((f) => ({ ...f, ...p }))
  const save = useAction(
    () => (existing ? (savePolicyDraft(account, existing.id, form), existing) : createPolicy(account, form)),
    (p: Policy) => (existing ? 'Draft saved' : `“${p.title}” created as a draft`),
  )

  return (
    <div className="max-w-5xl">
      <Link to={existing ? `/policies/${existing.id}` : '/policies'} className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={14} aria-hidden /> Back
      </Link>
      <PageHeader
        title={existing ? (newVersion ? `New version of ${existing.title}` : `Edit draft: ${existing.title}`) : 'New policy'}
        description="Saving never changes the version in force. Publish from the policy page when the draft is ready."
      />
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          const r = await save.run()
          if (r.ok) navigate(`/policies/${r.value.id}`)
        }}
        className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
      >
        <Panel
          title="Policy text"
          actions={
            <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
              {preview ? 'Edit' : 'Preview'}
            </Button>
          }
          bodyClassName="p-4"
        >
          {preview ? (
            <Markdown source={form.body} />
          ) : (
            <Field label="Body" hint="Use “## Heading” for sections — the assistant cites sections by heading. Supports **bold** and lists starting with “- ”.">
              {(a) => <Textarea {...a} rows={22} className="font-mono text-[13px]" value={form.body} onChange={(e) => set({ body: e.target.value })} />}
            </Field>
          )}
        </Panel>
        <div className="space-y-5">
          <Panel title="Details" bodyClassName="space-y-4 p-4">
            <Field label="Title" required>
              {(a) => <Input {...a} value={form.title} onChange={(e) => set({ title: e.target.value })} />}
            </Field>
            <Field label="Category" required hint="e.g. Time off, Conduct">
              {(a) => <Input {...a} value={form.category} onChange={(e) => set({ category: e.target.value })} list="policy-categories" />}
            </Field>
            <datalist id="policy-categories">
              {[...new Set(db.policies.map((p) => p.category))].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Field label="Summary">{(a) => <Textarea {...a} rows={2} value={form.summary} onChange={(e) => set({ summary: e.target.value })} />}</Field>
            <Field label="Tags" hint="Comma-separated words people might search for.">
              {(a) => <Input {...a} value={form.tags.join(', ')} onChange={(e) => set({ tags: e.target.value.split(',') })} />}
            </Field>
            <Field label="Effective date" required>
              {(a) => <Input {...a} type="date" value={form.effectiveDate} onChange={(e) => set({ effectiveDate: e.target.value })} />}
            </Field>
            <Field label="Change note" hint="What changed in this version.">
              {(a) => <Input {...a} value={form.changeNote} onChange={(e) => set({ changeNote: e.target.value })} />}
            </Field>
            <Field label="Review by">
              {(a) => <Input {...a} type="date" value={form.reviewBy ?? ''} onChange={(e) => set({ reviewBy: e.target.value || null })} />}
            </Field>
            <Checkbox
              label="Require acknowledgment"
              description="Employees in the audience must confirm they have read each published version."
              checked={form.requiresAcknowledgment}
              onChange={(e) => set({ requiresAcknowledgment: e.target.checked })}
            />
          </Panel>
          <Panel title="Audience" bodyClassName="space-y-2 p-4">
            <Checkbox label="Everyone" checked={!form.audienceDepartmentIds} onChange={(e) => set({ audienceDepartmentIds: e.target.checked ? null : [] })} />
            {form.audienceDepartmentIds &&
              db.departments.map((d) => (
                <Checkbox
                  key={d.id}
                  label={d.name}
                  checked={form.audienceDepartmentIds?.includes(d.id) ?? false}
                  onChange={(e) =>
                    set({
                      audienceDepartmentIds: e.target.checked
                        ? [...(form.audienceDepartmentIds ?? []), d.id]
                        : (form.audienceDepartmentIds ?? []).filter((x) => x !== d.id),
                    })
                  }
                />
              ))}
          </Panel>
          <div className="flex justify-end gap-2">
            <Button onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={save.pending}>
              Save draft
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
