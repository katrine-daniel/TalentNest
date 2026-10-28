import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BriefcaseBusiness, Search } from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import Avatar from '@/components/ui/Avatar'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useCollection } from '@/hooks/useStore'
import { useClickOutside } from '@/hooks/useClickOutside'
import { matchesCandidate, matchesJob } from '@/utils/search'
import { cn } from '@/utils/cn'

function useSearchResults(query) {
  const candidates = useCollection('candidates')
  const jobs = useCollection('jobs')
  return useMemo(() => {
    if (query.trim().length < 2) return []
    const c = candidates
      .filter((x) => matchesCandidate(x, query))
      .slice(0, 6)
      .map((x) => ({ type: 'candidate', id: x.id, title: `${x.firstName} ${x.lastName}`, subtitle: `${x.ref} · ${x.currentTitle}`, to: `/candidates/${x.id}` }))
    const j = jobs
      .filter((x) => matchesJob(x, query))
      .slice(0, 3)
      .map((x) => ({ type: 'job', id: x.id, title: x.title, subtitle: `${x.location} · ${x.openings} openings`, to: `/jobs/${x.id}` }))
    return [...c, ...j]
  }, [candidates, jobs, query])
}

function ResultList({ results, active, onPick, query }) {
  if (query.trim().length < 2) {
    return <p className="text-muted px-3 py-4 text-xs">Search candidates by name, email, skill or ID (e.g. CND-1004), or vacancies by title.</p>
  }
  if (!results.length) return <p className="text-muted px-3 py-4 text-xs">No matches for “{query}”.</p>
  return (
    <ul role="listbox" aria-label="Search results" className="max-h-80 scrollbar-thin overflow-y-auto py-1">
      {results.map((r, i) => (
        <li key={`${r.type}-${r.id}`} role="option" aria-selected={active === i}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(r)}
            className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left', active === i ? 'bg-subtle' : 'hover:bg-subtle')}
          >
            {r.type === 'candidate' ? (
              <Avatar name={r.title} size="sm" />
            ) : (
              <span className="bg-subtle text-muted flex h-8 w-8 items-center justify-center rounded-full">
                <BriefcaseBusiness size={15} />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{r.title}</span>
              <span className="text-muted block truncate text-xs">{r.subtitle}</span>
            </span>
            <span className="text-faint ml-auto text-[10px] uppercase">{r.type === 'candidate' ? 'Candidate' : 'Vacancy'}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Inline search with results popover (tablet & desktop). Ctrl/⌘ + K focuses it. */
export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  const navigate = useNavigate()
  const results = useSearchResults(query)

  useClickOutside(wrapRef, () => setOpen(false), open)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => setActive(0), [query])

  const pick = (r) => {
    navigate(r.to)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      pick(results[active])
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-md">
      <SearchInput
        ref={inputRef}
        value={query}
        onChange={(v) => {
          setQuery(v)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search candidates, skills, IDs…"
        label="Global search"
        shortcut="Ctrl K"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="border-line bg-surface shadow-pop absolute top-full right-0 left-0 z-40 mt-1.5 rounded-lg border p-1"
          >
            <ResultList results={results} active={active} onPick={pick} query={query} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Phone variant: icon button that opens a full-width search sheet. */
export function MobileSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const results = useSearchResults(query)
  return (
    <>
      <Button variant="ghost" iconOnly icon={Search} aria-label="Search" onClick={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Search" bodyClassName="px-3 py-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Name, email, skill or ID" label="Search" data-autofocus />
        <div className="mt-2">
          <ResultList
            results={results}
            active={-1}
            query={query}
            onPick={(r) => {
              navigate(r.to)
              setOpen(false)
              setQuery('')
            }}
          />
        </div>
      </Modal>
    </>
  )
}
