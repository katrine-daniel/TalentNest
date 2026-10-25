import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ClipboardCheck, FileSignature, MessageSquareText, UserPlus, X } from 'lucide-react'
import Dropdown from '@/components/ui/Dropdown'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { useCollection } from '@/hooks/useStore'
import { notificationService } from '@/services/notificationService'
import { formatRelative } from '@/utils/formatDate'
import { cn } from '@/utils/cn'

const ICONS = {
  feedback: MessageSquareText,
  assessment: ClipboardCheck,
  offer: FileSignature,
  application: UserPlus,
}

export default function NotificationsPanel() {
  const notifications = useCollection('notifications')
  const navigate = useNavigate()
  const unread = notifications.filter((n) => !n.read).length

  return (
    <Dropdown
      menuLabel="Notifications"
      className="w-[min(22rem,calc(100vw-2rem))] p-0"
      renderTrigger={(props) => (
        <button {...props} type="button" className="relative flex h-10 w-10 items-center justify-center rounded-lg text-ink-soft hover:bg-subtle hover:text-ink sm:h-9 sm:w-9" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-semibold text-white ring-2 ring-white">
              {unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <Button size="xs" variant="ghost" icon={CheckCheck} disabled={!unread} onClick={() => notificationService.markAllRead()}>
              Mark all read
            </Button>
          </div>
          {notifications.length === 0 ? (
            <EmptyState compact icon={Bell} title="You're all caught up" description="New applications, feedback requests and offer updates appear here." />
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto scrollbar-thin">
              {notifications.slice(0, 20).map((n) => {
                const Icon = ICONS[n.type] ?? Bell
                return (
                  <li key={n.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => {
                        notificationService.markRead(n.id)
                        close(false)
                        if (n.link) navigate(n.link)
                      }}
                      className={cn('flex w-full gap-3 px-4 py-3 pr-10 text-left hover:bg-subtle', !n.read && 'bg-brand-50/40')}
                    >
                      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md', n.read ? 'bg-subtle text-muted' : 'bg-brand-100 text-brand-700')}>
                        <Icon size={14} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn('truncate text-sm', !n.read && 'font-medium')}>{n.title}</span>
                          {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-muted">{n.body}</span>
                        <span className="mt-1 block text-[11px] text-faint">{formatRelative(n.at)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => notificationService.dismiss(n.id)}
                      className="absolute top-3 right-3 rounded p-1 text-faint opacity-100 hover:bg-white hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      aria-label={`Dismiss ${n.title}`}
                    >
                      <X size={13} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Dropdown>
  )
}
