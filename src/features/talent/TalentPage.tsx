import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bookmark, Copy, Library, Plus, Search, Trash2, UserPlus, X } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Avatar from '@/components/ui/Avatar'
import Pagination from '@/components/ui/Pagination'
import TagInput from '@/components/ui/TagInput'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useCollection } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import { findDuplicates } from '@/features/candidates/candidateService'
import { cn } from '@/utils/cn'
import type { Candidate, TalentSearchQuery } from '@/types/domain'
import { EMPTY_QUERY, searchTalent, talentService, type TalentResult } from './talentService'

const PAGE_SIZE = 12
const SORTS = {
  coverage: { label: 'Best skill coverage', fn: (a: TalentResult, b: TalentResult) => (b.skillCoverage ?? 0) - (a.skillCoverage ?? 0) },
  experience: { label: 'Most experience', fn: (a: TalentResult, b: TalentResult) => b.candidate.experienceYears - a.candidate.experienceYears },
  recent: { label: 'Recently added', fn: (a: TalentResult, b: TalentResult) => b.candidate.createdAt.localeCompare(a.candidate.createdAt) },
  name: { label: 'Name', fn: (a: TalentResult, b: TalentResult) => a.candidate.firstName.localeCompare(b.candidate.firstName) },
} as const
type SortKey = keyof typeof SORTS

const numOrNull = (v: string) => (v === '' ? null : Math.max(0, Number(v)))
const isEmptyQuery = (q: TalentSearchQuery) => !q.text && !q.skills.length && !q.location && q.minExperience === null && q.maxExperience === null && !q.pastRole

function ResultCard({ r, selected, onToggle, selectable }: { r: TalentResult; selected: boolean; onToggle: () => void; selectable: boolean }) {
  const c = r.candidate
  return (
    <li className={cn('border-line/80 bg-surface rounded-xl border p-4 transition-colors', selected && 'border-brand-400 ring-brand-200 ring-2')}>
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            className="accent-brand-600 mt-1 size-4"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${c.firstName} ${c.lastName}`}
          />
        )}
        <Avatar name={`${c.firstName} ${c.lastName}`} size="md" />
        <div className="min-w-0 flex-1">
          <Link to={`/candidates/${c.id}`} className="text-ink font-medium hover:underline">
            {c.firstName} {c.lastName}
          </Link>
          <p className="text-muted truncate text-xs">
            {c.currentTitle || 'No current title'} · {c.location} · {c.experienceYears} yrs
          </p>
        </div>
        {r.skillCoverage !== null && (
          <span className="text-ink-soft tabular shrink-0 text-xs" title="Share of the skills you searched for that this candidate lists">
            {r.matchedSkills.length} skill{r.matchedSkills.length === 1 ? '' : 's'} matched
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {c.skills.slice(0, 8).map((s) => (
          <span
            key={s}
            className={cn(
              'text-xxs rounded px-1.5 py-0.5',
              r.matchedSkills.some((m) => m.toLowerCase() === s.toLowerCase()) ? 'bg-brand-50 text-brand-700 font-medium' : 'bg-subtle text-muted',
            )}
          >
            {s}
          </span>
        ))}
      </div>
      {r.appliedTo.length > 0 && <p className="text-muted mt-2 truncate text-xs">Previously applied: {r.appliedTo.join(', ')}</p>}
    </li>
  )
}

function DuplicatesView({ candidates }: { candidates: readonly Candidate[] }) {
  const groups = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{ candidate: Candidate; matches: Array<{ candidate: Candidate; reasons: string[] }> }> = []
    candidates.forEach((c) => {
      if (seen.has(c.id)) return
      const matches = findDuplicates(c, candidates, c.id)
      if (!matches.length) return
      seen.add(c.id)
      matches.forEach((m) => seen.add(m.candidate.id))
      out.push({ candidate: c, matches })
    })
    return out
  }, [candidates])

  if (!groups.length)
    return <EmptyState icon={Copy} title="No likely duplicates" description="We compare email, phone, and name + location across every candidate record." />
  return (
    <ul className="space-y-3">
      {groups.map((g) => (
        <li key={g.candidate.id} className="border-line/80 bg-surface rounded-xl border p-4 text-sm">
          <p className="text-muted mb-2 text-xs">Possible duplicate records — review and merge manually.</p>
          <ul className="space-y-1.5">
            {[{ candidate: g.candidate, reasons: [] as string[] }, ...g.matches].map(({ candidate: c, reasons }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link to={`/candidates/${c.id}`} className="font-medium hover:underline">
                  {c.firstName} {c.lastName}
                </Link>
                <span className="text-muted">
                  {c.ref} · {c.email}
                </span>
                {reasons.length > 0 && <span className="rounded bg-amber-50 px-1.5 text-xs text-amber-800">{reasons.join(', ')}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

export default function TalentPage() {
  const candidates = useCollection('candidates')
  const applications = useCollection('applications')
  const jobs = useCollection('jobs')
  const pools = useCollection('talentPools')
  const searches = useCollection('savedSearches')
  const { actorId, can } = useSession()
  const [params, setParams] = useSearchParams()
  const poolId = params.get('pool')
  const view = params.get('view') === 'duplicates' ? 'duplicates' : 'search'
  const [query, setQuery] = useState<TalentSearchQuery>(EMPTY_QUERY)
  const [sort, setSort] = useState<SortKey>('coverage')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetPool, setTargetPool] = useState('')
  const [poolModal, setPoolModal] = useState(false)
  const [poolForm, setPoolForm] = useState({ name: '', description: '' })
  const [saveName, setSaveName] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [deletePool, setDeletePool] = useState<string | null>(null)
  const editable = can('talent.manage')

  const activePool = pools.find((p) => p.id === poolId)
  const results = useMemo(() => {
    const scope = activePool ? candidates.filter((c) => activePool.candidateIds.includes(c.id)) : candidates
    return searchTalent(query, { candidates: scope, applications, jobs }).sort(SORTS[sort].fn)
  }, [query, candidates, applications, jobs, sort, activePool])
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const skillSuggestions = useMemo(() => Array.from(new Set(candidates.flatMap((c) => c.skills))).sort(), [candidates])

  const update = (patch: Partial<TalentSearchQuery>) => {
    setQuery((q) => ({ ...q, ...patch }))
    setPage(1)
  }
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const addToPool = useAsyncAction((id: string, ids: string[]) => talentService.addToPool(id, ids), {
    success: (n: number) => (n ? `${n} candidate${n === 1 ? '' : 's'} added to pool` : 'Already in that pool'),
  })
  const removeFromPool = useAsyncAction((id: string, cid: string) => talentService.removeFromPool(id, cid), { success: 'Removed from pool' })
  const createPool = useAsyncAction(() => talentService.createPool(poolForm, { actorId }), { success: 'Talent pool created' })
  const removePool = useAsyncAction((id: string) => talentService.deletePool(id), { success: 'Talent pool deleted' })
  const saveSearch = useAsyncAction(() => talentService.saveSearch(saveName, query, { actorId }), { success: 'Search saved' })
  const deleteSearch = useAsyncAction((id: string) => talentService.deleteSearch(id), { success: 'Saved search removed' })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Talent pools"
        description="Rediscover past applicants, save searches and keep shortlists for future roles."
        actions={
          editable && (
            <Button variant="primary" icon={Plus} onClick={() => setPoolModal(true)}>
              New pool
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-5">
          <section className="border-line/80 bg-surface rounded-2xl border p-3">
            <h2 className="text-muted px-2 pb-2 text-xs font-semibold tracking-wide uppercase">Pools</h2>
            <ul className="space-y-0.5 text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => setParams({})}
                  className={cn(
                    'hover:bg-subtle flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left',
                    !poolId && view === 'search' && 'bg-brand-50 text-brand-700 font-medium',
                  )}
                >
                  <Search size={14} aria-hidden /> All candidates <span className="text-muted ml-auto text-xs">{candidates.length}</span>
                </button>
              </li>
              {pools.map((p) => (
                <li key={p.id} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => setParams({ pool: p.id })}
                    className={cn(
                      'hover:bg-subtle flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left',
                      poolId === p.id && 'bg-brand-50 text-brand-700 font-medium',
                    )}
                  >
                    <Library size={14} aria-hidden /> <span className="truncate">{p.name}</span>
                    <span className="text-muted ml-auto text-xs">{p.candidateIds.length}</span>
                  </button>
                  {editable && (
                    <Button size="xs" variant="ghost" iconOnly icon={Trash2} aria-label={`Delete pool ${p.name}`} onClick={() => setDeletePool(p.id)} />
                  )}
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setParams({ view: 'duplicates' })}
                  className={cn(
                    'hover:bg-subtle flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left',
                    view === 'duplicates' && 'bg-brand-50 text-brand-700 font-medium',
                  )}
                >
                  <Copy size={14} aria-hidden /> Possible duplicates
                </button>
              </li>
            </ul>
          </section>
          <section className="border-line/80 bg-surface rounded-2xl border p-3">
            <h2 className="text-muted px-2 pb-2 text-xs font-semibold tracking-wide uppercase">Saved searches</h2>
            {searches.length ? (
              <ul className="space-y-0.5 text-sm">
                {searches.map((s) => (
                  <li key={s.id} className="flex items-center">
                    <button
                      type="button"
                      className="hover:bg-subtle flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left"
                      onClick={() => {
                        setParams({})
                        setQuery({ ...EMPTY_QUERY, ...s.query })
                        setPage(1)
                      }}
                    >
                      <Bookmark size={14} aria-hidden /> <span className="truncate">{s.name}</span>
                    </button>
                    {s.createdById === actorId && (
                      <Button size="xs" variant="ghost" iconOnly icon={X} aria-label={`Delete saved search ${s.name}`} onClick={() => deleteSearch.run(s.id)} />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted px-2 text-xs">Save a search to reuse its filters later.</p>
            )}
          </section>
        </aside>

        <div className="min-w-0 space-y-4">
          {view === 'duplicates' ? (
            <DuplicatesView candidates={candidates} />
          ) : (
            <>
              {activePool && (
                <div className="border-brand-200 bg-brand-50/60 rounded-xl border px-4 py-3 text-sm">
                  <p className="text-ink font-medium">{activePool.name}</p>
                  {activePool.description && <p className="text-ink-soft">{activePool.description}</p>}
                </div>
              )}
              <form
                className="border-line/80 bg-surface grid grid-cols-1 gap-3 rounded-2xl border p-4 sm:grid-cols-2 xl:grid-cols-3"
                onSubmit={(e) => e.preventDefault()}
                aria-label="Talent search filters"
              >
                <Field label="Keyword">
                  {(a) => <Input {...a} value={query.text} onChange={(e) => update({ text: e.target.value })} placeholder="Name, email, ref, tag…" />}
                </Field>
                <Field label="Location">
                  {(a) => <Input {...a} value={query.location} onChange={(e) => update({ location: e.target.value })} placeholder="City" />}
                </Field>
                <Field label="Past or current role">
                  {(a) => <Input {...a} value={query.pastRole} onChange={(e) => update({ pastRole: e.target.value })} placeholder="e.g. Visa Officer" />}
                </Field>
                <Field label="Skills (any)" className="sm:col-span-2">
                  {(a) => (
                    <TagInput
                      {...a}
                      value={query.skills}
                      onChange={(skills: string[]) => update({ skills })}
                      suggestions={skillSuggestions}
                      placeholder="Add a skill and press Enter"
                    />
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Min. yrs">
                    {(a) => (
                      <Input
                        {...a}
                        type="number"
                        min={0}
                        value={query.minExperience ?? ''}
                        onChange={(e) => update({ minExperience: numOrNull(e.target.value) })}
                      />
                    )}
                  </Field>
                  <Field label="Max. yrs">
                    {(a) => (
                      <Input
                        {...a}
                        type="number"
                        min={0}
                        value={query.maxExperience ?? ''}
                        onChange={(e) => update({ maxExperience: numOrNull(e.target.value) })}
                      />
                    )}
                  </Field>
                </div>
              </form>

              <div className="flex flex-wrap items-center gap-2">
                <p className="text-muted mr-auto text-sm" aria-live="polite">
                  {results.length} candidate{results.length === 1 ? '' : 's'}
                </p>
                <Select
                  aria-label="Sort results"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))}
                />
                {!isEmptyQuery(query) && (
                  <>
                    <Button variant="ghost" onClick={() => setQuery(EMPTY_QUERY)}>
                      Clear
                    </Button>
                    <Button icon={Bookmark} onClick={() => setSaveOpen(true)}>
                      Save search
                    </Button>
                  </>
                )}
              </div>

              {editable && selected.size > 0 && (
                <div className="border-line bg-subtle flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                  <span className="mr-auto font-medium">{selected.size} selected</span>
                  {activePool ? (
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      onClick={async () => {
                        for (const id of selected) await removeFromPool.run(activePool.id, id)
                        setSelected(new Set())
                      }}
                    >
                      Remove from this pool
                    </Button>
                  ) : (
                    <>
                      <Select
                        aria-label="Pool to add to"
                        value={targetPool}
                        onChange={(e) => setTargetPool(e.target.value)}
                        options={pools.map((p) => ({ value: p.id, label: p.name }))}
                        placeholder="Choose pool…"
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        icon={UserPlus}
                        disabled={!targetPool}
                        loading={addToPool.pending}
                        onClick={async () => {
                          const res = await addToPool.run(targetPool, [...selected])
                          if (res.ok) setSelected(new Set())
                        }}
                      >
                        Add to pool
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    Clear selection
                  </Button>
                </div>
              )}

              {visible.length ? (
                <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {visible.map((r) => (
                    <ResultCard
                      key={r.candidate.id}
                      r={r}
                      selectable={editable}
                      selected={selected.has(r.candidate.id)}
                      onToggle={() => toggle(r.candidate.id)}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={Search}
                  title={activePool && !activePool.candidateIds.length ? 'This pool is empty' : 'No candidates match'}
                  description={activePool ? 'Select candidates from “All candidates” and add them here.' : 'Try removing a filter.'}
                />
              )}
              {results.length > PAGE_SIZE && (
                <Pagination page={current} pageCount={pageCount} total={results.length} pageSize={PAGE_SIZE} onChange={setPage} label="candidates" />
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        open={poolModal}
        onClose={() => setPoolModal(false)}
        title="New talent pool"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPoolModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={createPool.pending}
              onClick={async () => {
                const res = await createPool.run()
                if (res.ok) {
                  setPoolModal(false)
                  setPoolForm({ name: '', description: '' })
                  setParams({ pool: res.data.id })
                }
              }}
            >
              Create pool
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            {(a) => <Input {...a} value={poolForm.name} onChange={(e) => setPoolForm((f) => ({ ...f, name: e.target.value }))} data-autofocus />}
          </Field>
          <Field label="Description" optional>
            {(a) => <Textarea {...a} rows={3} value={poolForm.description} onChange={(e) => setPoolForm((f) => ({ ...f, description: e.target.value }))} />}
          </Field>
        </div>
      </Modal>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save this search"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saveSearch.pending}
              onClick={async () => {
                const res = await saveSearch.run()
                if (res.ok) {
                  setSaveOpen(false)
                  setSaveName('')
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Name" required>
          {(a) => (
            <Input {...a} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Senior visa specialists, Mumbai" data-autofocus />
          )}
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletePool)}
        onClose={() => setDeletePool(null)}
        title="Delete this talent pool?"
        description="Candidates stay in the system; only the pool is removed."
        confirmLabel="Delete pool"
        tone="danger"
        loading={removePool.pending}
        onConfirm={async () => {
          if (!deletePool) return
          await removePool.run(deletePool)
          if (deletePool === poolId) setParams({})
          setDeletePool(null)
        }}
      />
    </div>
  )
}
