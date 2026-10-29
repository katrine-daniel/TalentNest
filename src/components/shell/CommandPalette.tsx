import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpenText, ClipboardList, CornerDownLeft, FileText, Plus, Search, User, UserRoundCheck, Workflow, type LucideIcon } from 'lucide-react'
import { useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { NAVIGATION } from '@/config/navigation'
import { buildInbox } from '@/domain/inbox'
import { isHR } from '@/domain/permissions'
import { cn, fullName } from '@/lib/utils'
import { visibleRequests } from '@/services/requests'
import { visiblePolicies } from '@/services/policies'
import { visibleCases } from '@/services/lifecycle'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  icon: LucideIcon
  to: string
  keywords?: string
}

/** Global search and actions (Ctrl/Cmd+K). Only records the user is authorized to see are indexed. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb()
  const { account, can } = useSession()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    if (!open) return []
    const out: Command[] = []
    const actions: Array<[string, string, string, boolean]> = [
      ['Request leave', '/leave/new', 'time off holiday vacation', true],
      ['New HR request', '/requests/new', 'ticket ask help', true],
      ['Ask the assistant', '/assistant', 'ai question', true],
      ['Add employee', '/people?new=1', 'create hire', can('people.manage')],
      ['Import employees from CSV', '/people?import=1', 'upload', can('people.manage')],
      ['Start onboarding', '/lifecycle?start=onboarding', 'new hire checklist', can('lifecycle.manage')],
      ['Start offboarding', '/lifecycle?start=offboarding', 'leaver exit', can('lifecycle.manage')],
      ['New policy', '/policies/new', 'document', can('policies.manage')],
      ['New automation rule', '/automation?new=1', 'workflow', can('automation.manage')],
    ]
    for (const [label, to, keywords, allowed] of actions) if (allowed) out.push({ id: `a:${to}`, group: 'Actions', label, icon: Plus, to, keywords })
    for (const g of NAVIGATION)
      for (const item of g.items) {
        if (item.permission && !can(item.permission)) continue
        out.push({ id: `n:${item.to}`, group: 'Go to', label: item.label, icon: ArrowRight, to: item.to })
      }
    for (const i of buildInbox(db, account)
      .filter((x) => x.overdue)
      .slice(0, 8))
      out.push({ id: `o:${i.key}`, group: 'Overdue', label: i.title, hint: i.employee ? fullName(i.employee) : undefined, icon: ClipboardList, to: i.href })
    for (const e of db.employees)
      out.push({
        id: `e:${e.id}`,
        group: 'People',
        label: fullName(e),
        hint: `${e.title} · ${e.employeeNo}`,
        icon: User,
        to: `/people/${e.id}`,
        keywords: `${e.firstName} ${e.lastName} ${e.workEmail} ${e.employeeNo}`,
      })
    for (const r of visibleRequests(db, account))
      out.push({
        id: `r:${r.id}`,
        group: 'Requests',
        label: `${r.number} ${r.subject}`,
        hint: r.status.replace(/_/g, ' '),
        icon: FileText,
        to: `/requests/${r.id}`,
      })
    for (const p of visiblePolicies(db, account))
      out.push({
        id: `p:${p.id}`,
        group: 'Policies',
        label: p.title,
        hint: p.category,
        icon: BookOpenText,
        to: `/policies/${p.id}`,
        keywords: p.tags.join(' '),
      })
    for (const c of visibleCases(db, account).filter((x) => x.status === 'active')) {
      const e = db.employees.find((x) => x.id === c.employeeId)
      out.push({
        id: `c:${c.id}`,
        group: 'Checklists',
        label: `${c.kind === 'onboarding' ? 'Onboarding' : 'Offboarding'}: ${e ? fullName(e) : ''}`,
        icon: UserRoundCheck,
        to: `/lifecycle/${c.id}`,
      })
    }
    if (can('automation.manage'))
      for (const r of db.rules) out.push({ id: `w:${r.id}`, group: 'Workflows', label: r.name, icon: Workflow, to: `/automation?rule=${r.id}` })
    return out
  }, [open, db, account, can])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.filter((c) => c.group === 'Actions' || c.group === 'Go to' || c.group === 'Overdue').slice(0, 14)
    const terms = q.split(/\s+/)
    return commands.filter((c) => terms.every((t) => `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`.toLowerCase().includes(t))).slice(0, 30)
  }, [commands, query])

  useEffect(() => setActive(0), [query])
  if (!open) return null

  const go = (c: Command | undefined) => {
    if (!c) return
    onClose()
    navigate(c.to)
  }

  let lastGroup = ''
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="bg-navy-950/45 absolute inset-0" aria-hidden onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="bg-surface shadow-pop relative w-full max-w-xl overflow-hidden rounded-xl">
        <div className="border-line flex items-center gap-2 border-b px-4">
          <Search size={17} className="text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                go(results[active])
              } else if (e.key === 'Escape') onClose()
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-label="Search people, requests, policies or actions"
            placeholder={isHR(account) ? 'Search people, requests, policies, workflows…' : 'Search people, your requests, policies…'}
            className="h-12 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="text-muted border-line rounded border px-1.5 text-[11px]">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="max-h-[52vh] scrollbar-thin overflow-y-auto p-2">
          {results.length === 0 && <li className="text-muted px-3 py-6 text-center text-sm">No matches you have access to.</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            const Icon = c.icon
            return (
              <li key={c.id} role="presentation">
                {header && <p className="text-muted px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">{header}</p>}
                {/* Keyboard selection is handled by the combobox input (aria-activedescendant). */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
                <div
                  id={`${listId}-${i}`}
                  tabIndex={-1}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(c)}
                  className={cn('flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm', i === active ? 'bg-brand-50 text-ink' : 'text-ink-soft')}
                >
                  <Icon size={15} className={i === active ? 'text-brand-600' : 'text-muted'} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="text-muted max-w-[40%] truncate text-xs">{c.hint}</span>}
                  {i === active && <CornerDownLeft size={13} className="text-muted" aria-hidden />}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
