import { Link } from 'react-router-dom'
import Avatar from '@/components/ui/Avatar'
import { useSession } from '@/app/providers/SessionContext'
import { cn } from '@/utils/cn'

/** Signed-in user card at the bottom of the sidebar. Links to the user's settings. */
export default function SidebarProfile({ collapsed = false, onNavigate }) {
  const { user, role, viewAsRole } = useSession()
  return (
    <Link
      to="/settings/users"
      onClick={onNavigate}
      title={collapsed ? `${user.name} · ${role}` : undefined}
      aria-label={`${user.name}, ${role}. Open settings`}
      className={cn('flex items-center gap-3 rounded-xl transition-colors hover:bg-subtle', collapsed ? 'justify-center p-1' : 'border border-line/80 bg-linear-to-br from-brand-50 to-surface p-2.5')}
    >
      <Avatar name={user.name} size={collapsed ? 'sm' : 'md'} variant="brand" />
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
          <span className={cn('block truncate text-[11px]', viewAsRole ? 'font-medium text-brand-600' : 'text-muted')}>{viewAsRole ? `Viewing as ${role}` : user.title}</span>
        </span>
      )}
    </Link>
  )
}
