import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'

/** Free-form tag entry (skills). Enter or comma adds a tag; Backspace removes the last one. */
export default function TagInput({ value = [], onChange, suggestions = [], placeholder = 'Type and press Enter', id, invalid, max = 20, ...a11y }) {
  const [draft, setDraft] = useState('')

  const add = (raw) => {
    const tag = raw.trim().replace(/,$/, '')
    if (!tag || value.length >= max) return
    if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) return
    onChange([...value, tag])
    setDraft('')
  }

  const remove = (tag) => onChange(value.filter((v) => v !== tag))

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && !draft && value.length) {
      remove(value[value.length - 1])
    }
  }

  const open = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()) && s.toLowerCase().includes(draft.toLowerCase())).slice(0, 8)

  return (
    <div>
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-surface px-2 py-1.5 transition-colors focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-100',
          invalid ? 'border-red-400' : 'border-line-strong',
        )}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-brand-50 py-0.5 pr-1 pl-2 text-xs font-medium text-brand-800">
            {tag}
            <button type="button" onClick={() => remove(tag)} className="rounded p-0.5 text-brand-500 hover:bg-brand-100 hover:text-brand-800" aria-label={`Remove ${tag}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? '' : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-faint"
          {...a11y}
        />
      </div>
      {open.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggestions">
          {open.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-md border border-dashed border-line-strong px-2 py-0.5 text-xs text-muted hover:border-brand-300 hover:text-brand-700">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
