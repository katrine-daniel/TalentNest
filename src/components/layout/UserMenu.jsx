import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Eye, RotateCcw, Settings, ShieldCheck } from 'lucide-react'
import Dropdown from '@/components/ui/Dropdown'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useSession } from '@/app/providers/SessionContext'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { settingsService } from '@/features/settings/settingsService'
import { ROLES } from '@/utils/permissions'

export default function UserMenu() {
  const { user, role, actualRole, setViewAsRole, viewAsRole } = useSession()
  const navigate = useNavigate()
  const [confirmReset, setConfirmReset] = useState(false)
  const reset = useAsyncAction(settingsService.resetDemoData, { success: 'Demo data restored to its original state' })

  const items = [
    { heading: 'View interface as role (demo)' },
    ...ROLES.map((r) => ({
      key: `role-${r}`,
      label: r,
      icon: r === actualRole ? ShieldCheck : Eye,
      description: r === actualRole ? 'Your role' : 'Preview permissions',
      checked: role === r,
      onSelect: () => setViewAsRole(r === actualRole ? null : r),
    })),
    { divider: true },
    { label: 'Settings', icon: Settings, onSelect: () => navigate('/settings') },
    { label: 'Reset demo data', icon: RotateCcw, onSelect: () => setConfirmReset(true) },
  ]

  return (
    <>
      <Dropdown
        items={items}
        menuLabel="Account"
        className="w-64"
        renderTrigger={(props) => (
          <button {...props} type="button" className="flex items-center gap-2 rounded-lg p-1 hover:bg-subtle sm:pr-2" aria-label={`Account menu for ${user.name}`}>
            <Avatar name={user.name} size="sm" variant="brand" />
            <span className="hidden text-left leading-tight lg:block">
              <span className="block text-xs font-medium text-ink">{user.name}</span>
              <span className={viewAsRole ? 'block text-[11px] font-medium text-brand-600' : 'block text-[11px] text-muted'}>
                {viewAsRole ? `Viewing as ${role}` : role}
              </span>
            </span>
            <ChevronDown size={14} className="hidden text-faint lg:block" aria-hidden />
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
