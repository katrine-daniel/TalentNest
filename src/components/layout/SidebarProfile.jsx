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
      className={cn(
        'hover:bg-subtle flex items-center gap-3 rounded-xl transition-colors',
        collapsed ? 'justify-center p-1' : 'border-line/80 from-brand-50 to-surface border bg-linear-to-br p-2.5',
      )}
    >
      <Avatar name={user.name} size={collapsed ? 'sm' : 'md'} variant="brand" />
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="text-ink block truncate text-sm font-semibold">{user.name}</span>
          <span className={cn('block truncate text-[11px]', viewAsRole ? 'text-brand-600 font-medium' : 'text-muted')}>
            {viewAsRole ? `Viewing as ${role}` : user.title}
          </span>
        </span>
      )}
    </Link>
  )
}
