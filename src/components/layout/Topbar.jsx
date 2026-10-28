import { useEffect, useState } from 'react'
import { FlaskConical, Menu, Search } from 'lucide-react'
import Breadcrumbs from './Breadcrumbs'
import CommandPalette from './CommandPalette'
import QuickCreateMenu from './QuickCreateMenu'
import NotificationsPanel from './NotificationsPanel'
import UserMenu from './UserMenu'
import { useSession } from '@/app/providers/SessionContext'

export default function Topbar({ onOpenNav }) {
  const { mode } = useSession()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="border-line bg-surface/90 supports-[backdrop-filter]:bg-surface/80 sticky top-0 z-20 border-b backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
        <button type="button" onClick={onOpenNav} className="text-ink-soft hover:bg-subtle -ml-1 rounded-lg p-2 md:hidden" aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <div className="min-w-0 flex-1 md:flex-none md:basis-56 lg:basis-72">
          <Breadcrumbs />
        </div>
        <div className="hidden flex-1 justify-center md:flex">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="border-line-strong bg-surface text-faint hover:border-brand-300 flex h-9 w-full max-w-md items-center gap-2 rounded-lg border px-3 text-sm transition-colors"
            aria-label="Search or run a command (Ctrl K)"
          >
            <Search size={15} aria-hidden />
            <span className="flex-1 text-left">Search or jump to…</span>
            <kbd className="border-line bg-subtle text-muted rounded border px-1.5 text-[10px] font-medium">Ctrl K</kbd>
          </button>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5">
          <button type="button" onClick={() => setPaletteOpen(true)} className="text-ink-soft hover:bg-subtle rounded-lg p-2 md:hidden" aria-label="Search">
            <Search size={18} />
          </button>
          <QuickCreateMenu />
          <NotificationsPanel />
          <UserMenu />
        </div>
      </div>
      {mode === 'demo' && (
        <p className="border-brand-100 bg-brand-50 text-brand-800 flex items-center justify-center gap-2 border-t px-4 py-1 text-[11px]">
          <FlaskConical size={12} aria-hidden /> Demo workspace — fictional data stored only in this browser. No emails, invites or AI calls are sent.
        </p>
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  )
}
