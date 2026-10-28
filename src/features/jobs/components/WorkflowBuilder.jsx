import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import Button from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/FormControls'
import { STAGE_TYPES, STAGE_TYPE_OPTIONS } from '@/utils/statusHelpers'
import { cn } from '@/utils/cn'

let tmpCounter = 0
const tmpId = () => `tmp-${Date.now().toString(36)}-${(tmpCounter += 1)}`

/**
 * Edits an ordered list of recruitment stages. Used for vacancy-specific
 * workflows (JobForm) and reusable templates (Settings).
 * `counts` (stageId → candidates) prevents deleting stages that still hold candidates.
 */
export default function WorkflowBuilder({ stages, onChange, counts = {}, readOnly = false, error }) {
  if (readOnly) return <WorkflowPreview stages={stages} counts={counts} />

  const update = (index, patch) => onChange(stages.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  const move = (index, dir) => {
    const next = [...stages]
    const target = index + dir
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const remove = (index) => onChange(stages.filter((_, i) => i !== index))
  const add = () => {
    const insertAt = Math.max(1, stages.length - 1)
    const next = [...stages]
    next.splice(insertAt, 0, { id: tmpId(), name: 'New interview round', type: 'interview' })
    onChange(next)
  }

  return (
    <div>
      <ol className="space-y-2">
        <AnimatePresence initial={false}>
          {stages.map((stage, i) => {
            const count = counts[stage.id] ?? 0
            const fixed = i === 0 || i === stages.length - 1
            return (
              <motion.li
                key={stage.id ?? stage.key}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16 }}
                className="border-line bg-surface flex flex-wrap items-center gap-2 rounded-lg border p-2 sm:flex-nowrap"
              >
                <span className="text-faint tabular flex w-6 shrink-0 items-center justify-center text-xs font-medium">{i + 1}</span>
                <span className={cn('h-2 w-2 shrink-0 rounded-full', STAGE_TYPES[stage.type]?.dot)} aria-hidden />
                <Input
                  aria-label={`Stage ${i + 1} name`}
                  value={stage.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="min-w-0 flex-1 basis-40"
                  invalid={!stage.name.trim()}
                />
                <div className="w-full sm:w-40">
                  <Select
                    aria-label={`Stage ${i + 1} type`}
                    value={stage.type}
                    disabled={fixed}
                    onChange={(e) => update(i, { type: e.target.value })}
                    options={STAGE_TYPE_OPTIONS.filter((o) => (fixed ? true : o.value !== 'application' && o.value !== 'hired'))}
                  />
                </div>
                <div className="ml-auto flex items-center gap-0.5">
                  {count > 0 && (
                    <span className="bg-subtle text-xxs text-muted tabular mr-1 rounded px-1.5" title="Candidates currently in this stage">
                      {count}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={ArrowUp}
                    aria-label={`Move ${stage.name} up`}
                    disabled={i <= 1 || fixed}
                    onClick={() => move(i, -1)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={ArrowDown}
                    aria-label={`Move ${stage.name} down`}
                    disabled={fixed || i >= stages.length - 2}
                    onClick={() => move(i, 1)}
                  />
                  <Button
                    size="sm"
                    variant="danger-ghost"
                    iconOnly
                    icon={Trash2}
                    aria-label={`Remove ${stage.name}`}
                    title={count > 0 ? 'Move candidates out of this stage first' : fixed ? 'First and last stages are required' : undefined}
                    disabled={fixed || count > 0}
                    onClick={() => remove(i)}
                  />
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="secondary" icon={Plus} onClick={add}>
          Add stage
        </Button>
        <p className="text-muted text-xs">First stage collects applications; the last stage marks a hire.</p>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function WorkflowPreview({ stages, counts = {} }) {
  return (
    <ol className="flex flex-wrap items-center gap-y-2 text-xs">
      {stages.map((stage, i) => (
        <li key={stage.id ?? stage.key} className="flex items-center">
          <span className="border-line bg-surface inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
            <span className={cn('h-1.5 w-1.5 rounded-full', STAGE_TYPES[stage.type]?.dot)} aria-hidden />
            <span className="text-ink">{stage.name}</span>
            {counts[stage.id] > 0 && <span className="text-muted tabular">· {counts[stage.id]}</span>}
          </span>
          {i < stages.length - 1 && (
            <span className="text-faint mx-1.5" aria-hidden>
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}
