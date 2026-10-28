import { Menu } from 'lucide-react'
import Breadcrumbs from './Breadcrumbs'
import GlobalSearch, { MobileSearch } from './GlobalSearch'
import QuickCreateMenu from './QuickCreateMenu'
import NotificationsPanel from './NotificationsPanel'
import UserMenu from './UserMenu'
import { useSession } from '@/app/providers/SessionContext'

export default function Topbar({ onOpenNav }) {
  const { viewAsRole, role, setViewAsRole } = useSession()
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
        <button type="button" onClick={onOpenNav} className="-ml-1 rounded-lg p-2 text-ink-soft hover:bg-subtle md:hidden" aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <div className="min-w-0 flex-1 md:flex-none md:basis-56 lg:basis-72">
          <Breadcrumbs />
        </div>
        <div className="hidden flex-1 justify-center md:flex">
          <GlobalSearch />
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5">
          <div className="md:hidden">
            <MobileSearch />
          </div>
          <QuickCreateMenu />
          <NotificationsPanel />
          <UserMenu />
        </div>
      </div>
      {viewAsRole && (
        <div className="flex items-center justify-center gap-2 border-t border-brand-100 bg-brand-50 px-4 py-1.5 text-xs text-brand-800">
          Previewing the interface as <strong className="font-semibold">{role}</strong> — UI only; the backend must enforce permissions.
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => setViewAsRole(null)}>
            Exit preview
          </button>
        </div>
      )}
    </header>
  )
}
