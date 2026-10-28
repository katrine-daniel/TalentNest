import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Monitor, Moon, RotateCcw, Settings, Sun } from 'lucide-react'
import Dropdown from '@/components/ui/Dropdown'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useSession } from '@/app/providers/SessionContext'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTheme } from '@/app/providers/ThemeProvider'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { settingsService } from '@/features/settings/settingsService'

export default function UserMenu() {
  const { user, role, mode } = useSession()
  const { signOut } = useAuth()
  const { preference, setPreference } = useTheme()
  const navigate = useNavigate()
  const [confirmReset, setConfirmReset] = useState(false)
  const reset = useAsyncAction(settingsService.resetDemoData, { success: 'Demo data restored to its original state' })

  const items = [
    { heading: 'Theme' },
    { key: 'light', label: 'Light', icon: Sun, checked: preference === 'light', onSelect: () => setPreference('light') },
    { key: 'dark', label: 'Dark', icon: Moon, checked: preference === 'dark', onSelect: () => setPreference('dark') },
    { key: 'system', label: 'Match system', icon: Monitor, checked: preference === 'system', onSelect: () => setPreference('system') },
    { divider: true },
    { label: 'Settings', icon: Settings, onSelect: () => navigate('/settings') },
    ...(mode === 'demo' ? [{ label: 'Reset demo data', icon: RotateCcw, onSelect: () => setConfirmReset(true) }] : []),
    { divider: true },
    {
      label: mode === 'demo' ? 'Leave demo' : 'Sign out',
      icon: LogOut,
      onSelect: async () => {
        await signOut()
        navigate('/login', { replace: true })
      },
    },
  ]

  return (
    <>
      <Dropdown
        items={items}
        menuLabel="Account"
        className="w-60"
        renderTrigger={(props) => (
          <button
            {...props}
            type="button"
            className="hover:bg-subtle flex items-center gap-2 rounded-lg p-1 sm:pr-2"
            aria-label={`Account menu for ${user.name}`}
          >
            <Avatar name={user.name} size="sm" variant="brand" />
            <span className="hidden text-left leading-tight lg:block">
              <span className="text-ink block text-xs font-medium">{user.name}</span>
              <span className="text-muted block text-[11px]">
                {role}
                {mode === 'demo' ? ' · demo' : ''}
              </span>
            </span>
            <ChevronDown size={14} className="text-faint hidden lg:block" aria-hidden />
          </button>
        )}
      />
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        description="All demo changes stored in this browser (new candidates, moved stages, interviews, settings) will be replaced with the original sample data."
        confirmLabel="Reset data"
        tone="danger"
        loading={reset.pending}
        onConfirm={async () => {
          const res = await reset.run()
          if (res.ok) setConfirmReset(false)
        }}
      />
    </>
  )
}
