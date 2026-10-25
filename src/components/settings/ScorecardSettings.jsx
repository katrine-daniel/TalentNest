import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/FormControls'
import { useCollection } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { settingsService } from '@/services/settingsService'

/** Interview scorecards: weighted evaluation criteria used by the feedback form. */
export default function ScorecardSettings({ readOnly }) {
  const scorecards = useCollection('scorecards')
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)
  const save = useAsyncAction(settingsService.saveScorecard, { success: 'Scorecard saved' })
  const total = draft ? draft.criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0) : 0

  const open = (sc) => {
    setError(null)
    setDraft(sc ? { ...sc, criteria: sc.criteria.map((c) => ({ ...c })) } : { name: '', criteria: [{ id: '', name: '', weight: 100 }] })
  }

  const setCriterion = (i, patch) => setDraft((d) => ({ ...d, criteria: d.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  const submit = async (e) => {
    e.preventDefault()
    if (!draft.name.trim()) return setError('Scorecard name is required')
    if (draft.criteria.some((c) => !c.name.trim())) return setError('Every criterion needs a name')
    const res = await save.run(draft)
    if (res.ok) setDraft(null)
    else setError(res.error?.message)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" icon={Plus} onClick={() => open(null)} disabled={readOnly}>
          New scorecard
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {scorecards.map((sc) => (
          <article key={sc.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-medium">{sc.name}</h3>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(sc)} disabled={readOnly}>
                Edit
              </Button>
            </div>
            <ul className="space-y-2">
              {sc.criteria.map((c) => (
                <li key={c.id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 text-ink-soft">{c.name}</span>
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-subtle">
                    <span className="block h-full rounded-full bg-brand-500" style={{ width: `${c.weight}%` }} />
                  </span>
                  <span className="w-9 text-right text-xs text-muted tabular">{c.weight}%</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit scorecard' : 'New scorecard'}
        footer={
          <>
            <span className={`mr-auto text-xs tabular ${total === 100 ? 'text-muted' : 'font-medium text-red-600'}`}>Total weight {total}%</span>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="sc-form" loading={save.pending}>
              Save
            </Button>
          </>
        }
      >
        {draft && (
          <form id="sc-form" onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Scorecard name" required>
              {(a) => <Input {...a} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-autofocus />}
            </Field>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-medium text-ink-soft">Criteria & weights</legend>
              {draft.criteria.map((c, i) => (
                <div key={c.id || i} className="flex gap-2">
                  <Input aria-label={`Criterion ${i + 1} name`} value={c.name} onChange={(e) => setCriterion(i, { name: e.target.value })} placeholder="e.g. Communication" />
                  <Input aria-label={`Criterion ${i + 1} weight`} type="number" min={0} max={100} value={c.weight} onChange={(e) => setCriterion(i, { weight: e.target.value })} className="w-20" />
                  <Button variant="ghost" iconOnly icon={Trash2} aria-label={`Remove criterion ${i + 1}`} disabled={draft.criteria.length === 1} onClick={() => setDraft({ ...draft, criteria: draft.criteria.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => setDraft({ ...draft, criteria: [...draft.criteria, { id: '', name: '', weight: 0 }] })}>
                Add criterion
              </Button>
            </fieldset>
            {error && (
              <p className="text-xs text-red-600" role="alert">
                {error}
              </p>
            )}
          </form>
        )}
      </Modal>
    </div>
  )
}
