import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, LogOut, Menu, RotateCcw, Search, Settings, X } from 'lucide-react'
import { env } from '@/config/env'
import { NAVIGATION } from '@/config/navigation'
import { useDb } from '@/app/hooks'
import { useAuth, useSession } from '@/app/session'
import { buildInbox, isSnoozed } from '@/domain/inbox'
import { isHR, ROLE_LABELS } from '@/domain/permissions'
import { isOverdue } from '@/domain/sla'
import { formatRelative } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { markAllRead, markRead } from '@/services/notifications'
import { store } from '@/services/store'
import { Avatar } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { CommandPalette } from './CommandPalette'
import { Logo } from './Logo'

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const db = useDb()
  const { account, can } = useSession()
  const counts = useMemo(() => {
    const inbox = buildInbox(db, account).filter((i) => !isSnoozed(db, account.id, i.key))
    return {
      inbox: inbox.length,
      requests: isHR(account) ? db.requests.filter((r) => isOverdue(r)).length : 0,
      leave: inbox.filter((i) => i.kind === 'leave_approval').length,
    }
  }, [db, account])
  const managerOrHR = account.role !== 'employee'
  return (
    <nav aria-label="Main" className="flex-1 scrollbar-thin overflow-y-auto px-3 py-3">
      {NAVIGATION.map((group, gi) => {
        const items = group.items.filter((i) => (!i.permission || can(i.permission)) && (!i.managersAndHR || managerOrHR))
        if (!items.length) return null
        return (
          <div key={gi} className="mb-4">
            {group.label && <p className="text-navy-300/80 px-2.5 pb-1.5 text-[11px] font-medium tracking-wide uppercase">{group.label}</p>}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const count = item.badge ? counts[item.badge] : 0
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13.5px] transition-colors',
                          isActive ? 'bg-brand-600 font-medium text-white' : 'text-navy-300 hover:bg-navy-800 hover:text-white',
                        )
                      }
                    >
                      <item.icon size={16} aria-hidden className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            'tabular rounded px-1.5 text-[11px] font-semibold',
                            item.badge === 'requests' ? 'bg-red-500/90 text-white' : 'bg-navy-700 text-white',
                          )}
                          aria-label={`${count} ${item.badge === 'requests' ? 'overdue' : 'pending'}`}
                        >
                          {count}
                        </span>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

function Notifications() {
  const db = useDb()
  const { account } = useSession()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  const mine = db.notifications.filter((n) => n.accountId === account.id).slice(0, 30)
  const unread = mine.filter((n) => !n.read).length
  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        iconOnly
        icon={Bell}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {unread > 0 && <span className="bg-danger pointer-events-none absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-white" aria-hidden />}
      {open && (
        <div className="bg-surface shadow-pop border-line absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-1.5rem))] rounded-lg border">
          <div className="border-line flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" className="text-brand-700 text-xs font-medium hover:underline" onClick={() => markAllRead(account)}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] scrollbar-thin overflow-y-auto">
            {mine.length === 0 && <li className="text-muted px-4 py-8 text-center text-sm">You have no notifications.</li>}
            {mine.map((n) => (
              <li key={n.id} className="border-line border-b last:border-0">
                <button
                  type="button"
                  className="hover:bg-page flex w-full gap-3 px-4 py-3 text-left"
                  onClick={() => {
                    if (!n.read) markRead(account, n.id)
                    setOpen(false)
                    if (n.link) navigate(n.link)
                  }}
                >
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-600')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', !n.read && 'font-medium')}>{n.title}</span>
                    {n.body && <span className="text-muted block truncate text-xs">{n.body}</span>}
                    <span className="text-muted text-[11px]">{formatRelative(n.at)}</span>
                  </span>
                  {!n.read && <span className="sr-only">Unread</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-line border-t px-4 py-2">
            <Link to="/settings?tab=notifications" className="text-muted hover:text-ink text-xs" onClick={() => setOpen(false)}>
              Notification preferences
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function AccountMenu() {
  const { account } = useSession()
  const auth = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${account.name}`}
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-subtle flex items-center gap-2 rounded-md py-1 pr-1.5 pl-1"
      >
        <Avatar name={account.name} size="sm" />
        <span className="hidden text-left sm:block">
          <span className="block text-[13px] leading-tight font-medium">{account.name}</span>
          <span className="text-muted block text-[11px] leading-tight">{ROLE_LABELS[account.role]}</span>
        </span>
        <ChevronDown size={14} className="text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="bg-surface shadow-pop border-line absolute right-0 z-40 mt-2 w-60 rounded-lg border p-1">
          <div className="border-line mb-1 border-b px-3 py-2">
            <p className="truncate text-sm font-medium">{account.name}</p>
            <p className="text-muted truncate text-xs">{account.email}</p>
          </div>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className="hover:bg-subtle flex items-center gap-2 rounded px-3 py-2 text-sm">
            <Settings size={15} aria-hidden /> Settings
          </Link>
          {auth.mode === 'demo' && (
            <button
              role="menuitem"
              type="button"
              className="hover:bg-subtle flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm"
              onClick={() => {
                setOpen(false)
                setConfirmReset(true)
              }}
            >
              <RotateCcw size={15} aria-hidden /> Reset demo data
            </button>
          )}
          <button
            role="menuitem"
            type="button"
            className="hover:bg-subtle flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm"
            onClick={() => void auth.signOut()}
          >
            <LogOut size={15} aria-hidden /> {auth.mode === 'demo' ? 'Switch demo account' : 'Sign out'}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        description="All changes made in this browser are replaced with the original fictional data set."
        confirmLabel="Reset data"
        tone="danger"
        onConfirm={async () => {
          await auth.resetDemo()
          setConfirmReset(false)
          toast.success('Demo data restored')
        }}
      />
    </div>
  )
}

export function AppShell() {
  const db = useDb()
  const auth = useAuth()
  const location = useLocation()
  const toast = useToast()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => store.onPersistError((m) => toast.error(`Your last change may not have been saved: ${m}`)), [toast])
  useEffect(() => setMobileOpen(false), [location.pathname])

  const brand = (
    <div className="flex h-14 items-center gap-2.5 px-5">
      <Logo />
      <div className="min-w-0">
        <p className="truncate text-[15px] leading-tight font-semibold text-white">{env.productName}</p>
        <p className="text-navy-300 truncate text-[11px] leading-tight">{db.organization.name}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh">
      <a href="#main" className="bg-brand-600 sr-only z-[70] rounded px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <aside className="bg-navy-900 fixed inset-y-0 left-0 z-30 hidden w-60 flex-col lg:flex">
        {brand}
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="bg-navy-950/50 absolute inset-0" aria-hidden onClick={() => setMobileOpen(false)} />
          <aside className="bg-navy-900 relative flex h-full w-72 max-w-[85vw] flex-col" aria-label="Navigation">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button type="button" className="text-navy-300 rounded p-1 hover:text-white" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="border-line bg-surface/95 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-5">
          <Button variant="ghost" iconOnly icon={Menu} aria-label="Open navigation" className="lg:hidden" onClick={() => setMobileOpen(true)} />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="border-line bg-page text-muted hover:border-line-strong flex h-9 w-full max-w-md items-center gap-2 rounded-md border px-3 text-sm"
            aria-label="Search or run a command (Ctrl+K)"
          >
            <Search size={15} aria-hidden />
            <span className="flex-1 truncate text-left">Search or jump to…</span>
            <kbd className="border-line bg-surface hidden rounded border px-1.5 text-[11px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            {auth.mode === 'demo' && (
              <span className="bg-warning-soft text-warning hidden rounded px-2 py-1 text-[11px] font-medium md:inline">Demo workspace · fictional data</span>
            )}
            <Notifications />
            <AccountMenu />
          </div>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-16 focus:outline-none sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
