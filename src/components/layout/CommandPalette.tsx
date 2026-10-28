import { useEffect, useId, useMemo, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BriefcaseBusiness,
  CalendarClock,
  CalendarPlus,
  ClipboardCheck,
  CornerDownLeft,
  FilePlus2,
  Search,
  UserPlus,
  Users,
  type LucideProps,
} from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useCollection, fullName } from '@/hooks/useStore'
import { useGlobalActions } from '@/app/providers/GlobalActionsContext'
import { useSession } from '@/app/providers/SessionContext'
import { NAV_SECTIONS, SETTINGS_NAV } from '@/config/navigation'
import { matchesCandidate, matchesJob } from '@/utils/search'
import { formatDateTime } from '@/utils/formatDate'
import { cn } from '@/utils/cn'
import type { Permission } from '@/utils/permissions'

type Icon = ComponentType<LucideProps>

interface Command {
  id: string
  group: 'Actions' | 'Go to' | 'Candidates' | 'Vacancies' | 'Interviews'
  label: string
  hint?: string
  icon: Icon
  run: () => void
  keywords?: string
}

const GROUP_ORDER: Command['group'][] = ['Actions', 'Candidates', 'Vacancies', 'Interviews', 'Go to']

/** Keyboard-first search and command launcher, opened with Ctrl+K / ⌘K. */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal(<AnimatePresence>{open && <PaletteDialog onClose={onClose} />}</AnimatePresence>, document.body)
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const ref = useFocusTrap(true, onClose) as React.RefObject<HTMLDivElement>
  const navigate = useNavigate()
  const actions = useGlobalActions() as Record<string, (payload?: unknown) => void>
  const { can } = useSession()
  const candidates = useCollection('candidates')
  const jobs = useCollection('jobs')
  const interviews = useCollection('interviews')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)

  const commands = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase()
    const go = (to: string) => () => {
      onClose()
      navigate(to)
    }
    const act = (name: string) => () => {
      onClose()
      actions[name]?.()
    }
    const allowed = (p: Permission) => can(p)

    const base: Command[] = [
      ...(allowed('candidates.manage')
        ? [{ id: 'a-cand', group: 'Actions' as const, label: 'Add candidate', icon: UserPlus, run: act('openCandidateForm'), keywords: 'new create' }]
        : []),
      ...(allowed('jobs.manage')
        ? [{ id: 'a-job', group: 'Actions' as const, label: 'Create vacancy', icon: BriefcaseBusiness, run: act('openJobForm'), keywords: 'new job' }]
        : []),
      ...(allowed('requisitions.create')
        ? [
            {
              id: 'a-req',
              group: 'Actions' as const,
              label: 'Raise requisition',
              icon: FilePlus2,
              run: go('/requisitions?new=1'),
              keywords: 'headcount approval',
            },
          ]
        : []),
      ...(allowed('interviews.schedule')
        ? [
            { id: 'a-int', group: 'Actions' as const, label: 'Schedule interview', icon: CalendarPlus, run: act('openSchedule'), keywords: 'calendar' },
            { id: 'a-asm', group: 'Actions' as const, label: 'Assign assessment', icon: ClipboardCheck, run: act('openAssessment'), keywords: 'test' },
          ]
        : []),
      ...[...NAV_SECTIONS.flatMap((s) => s.items), SETTINGS_NAV]
        .filter((n) => !('permission' in n) || !n.permission || can(n.permission as Permission))
        .map((n) => ({ id: `nav-${n.to}`, group: 'Go to' as const, label: n.label, icon: n.icon as Icon, run: go(n.to) })),
    ]
    const filtered = q ? base.filter((c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(q)) : base

    if (q.length < 2) return filtered
    const cand = candidates
      .filter((c) => matchesCandidate(c, q))
      .slice(0, 6)
      .map<Command>((c) => ({
        id: `c-${c.id}`,
        group: 'Candidates',
        label: fullName(c),
        hint: `${c.ref} · ${c.currentTitle}`,
        icon: Users,
        run: go(`/candidates/${c.id}`),
      }))
    const vac = jobs
      .filter((j) => matchesJob(j, q))
      .slice(0, 4)
      .map<Command>((j) => ({
        id: `j-${j.id}`,
        group: 'Vacancies',
        label: j.title,
        hint: `${j.location} · ${j.status}`,
        icon: BriefcaseBusiness,
        run: go(`/jobs/${j.id}`),
      }))
    const byId = new Map(candidates.map((c) => [c.id, c]))
    const ints = interviews
      .filter((i) => i.status === 'scheduled' && `${fullName(byId.get(i.candidateId))} ${i.stageName}`.toLowerCase().includes(q))
      .slice(0, 4)
      .map<Command>((i) => ({
        id: `i-${i.id}`,
        group: 'Interviews',
        label: `${i.stageName} — ${fullName(byId.get(i.candidateId))}`,
        hint: formatDateTime(i.start),
        icon: CalendarClock,
        run: go(`/calendar?event=${i.id}`),
      }))
    return [...filtered, ...cand, ...vac, ...ints]
  }, [query, candidates, jobs, interviews, actions, can, navigate, onClose])

  const ordered = useMemo(() => GROUP_ORDER.flatMap((g) => commands.filter((c) => c.group === g)), [commands])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, ordered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      ordered[active]?.run()
    }
  }

  let index = -1
  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center p-3 pt-[12vh] sm:p-6 sm:pt-[14vh]">
      <motion.div
        className="absolute inset-0 bg-gray-950/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="bg-surface shadow-lift border-line relative w-full max-w-xl overflow-hidden rounded-2xl border"
        initial={{ opacity: 0, scale: 0.98, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -8 }}
        transition={{ duration: 0.15 }}
      >
        <div className="border-line flex items-center gap-3 border-b px-4">
          <Search size={17} className="text-faint shrink-0" aria-hidden />
          <input
            data-autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={ordered[active] ? `${listId}-${ordered[active].id}` : undefined}
            aria-autocomplete="list"
            aria-label="Search candidates, vacancies, interviews or actions"
            placeholder="Search candidates, vacancies, interviews or type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="text-ink placeholder:text-faint h-13 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="border-line bg-subtle text-muted hidden rounded border px-1.5 text-[10px] sm:block">Esc</kbd>
        </div>
        <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="max-h-[55vh] scrollbar-thin overflow-y-auto p-2">
          {ordered.length === 0 && (
            <li className="text-muted px-3 py-8 text-center text-sm">No results for “{query}”. Try a name, email, skill, candidate ID or vacancy title.</li>
          )}
          {GROUP_ORDER.map((group) => {
            const items = ordered.filter((c) => c.group === group)
            if (!items.length) return null
            return (
              <li key={group} role="presentation">
                <p className="text-faint px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase">{group}</p>
                <ul role="presentation">
                  {items.map((c) => {
                    index += 1
                    const i = index
                    const Icon = c.icon
                    return (
                      // Keyboard selection is handled by the combobox input via aria-activedescendant.
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                      <li
                        key={c.id}
                        id={`${listId}-${c.id}`}
                        role="option"
                        aria-selected={active === i}
                        data-index={i}
                        onMouseMove={() => setActive(i)}
                        onClick={c.run}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                          active === i ? 'bg-brand-50 text-ink' : 'text-ink-soft',
                        )}
                      >
                        <Icon size={16} className={active === i ? 'text-brand-600' : 'text-faint'} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{c.label}</span>
                        {c.hint && <span className="text-muted hidden truncate text-xs sm:block">{c.hint}</span>}
                        {active === i && <CornerDownLeft size={13} className="text-faint" aria-hidden />}
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          })}
        </ul>
        <p className="border-line text-faint border-t px-4 py-2 text-[11px]">↑↓ to move · Enter to open · Esc to close</p>
      </motion.div>
    </div>
  )
}
