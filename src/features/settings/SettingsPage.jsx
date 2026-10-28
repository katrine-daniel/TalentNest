import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { RotateCcw, ShieldAlert } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import MockNotice from '@/components/ui/MockNotice'
import SettingsNav, { SETTINGS_SECTIONS } from '@/features/settings/components/SettingsNav'
import UserManagement from '@/features/settings/components/UserManagement'
import RolePermissions from '@/features/settings/components/RolePermissions'
import DepartmentSettings from '@/features/settings/components/DepartmentSettings'
import WorkflowSettings from '@/features/settings/components/WorkflowSettings'
import NotificationSettings from '@/features/settings/components/NotificationSettings'
import AssessmentTemplates from '@/features/settings/components/AssessmentTemplates'
import ScorecardSettings from '@/features/settings/components/ScorecardSettings'
import { useSession } from '@/app/providers/SessionContext'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { settingsService } from './settingsService'
import { DEMO_STORAGE_KEY } from '@/config/env'

function DemoDataSettings() {
  const [open, setOpen] = useState(false)
  const reset = useAsyncAction(settingsService.resetDemoData, { success: 'Demo data restored' })
  return (
    <div className="border-line/80 bg-surface shadow-card space-y-4 rounded-2xl border p-5">
      <p className="text-ink-soft text-sm">
        This frontend runs on a mock data layer. Changes you make are saved in this browser’s local storage (key{' '}
        <code className="bg-subtle rounded px-1 text-xs">{DEMO_STORAGE_KEY}</code>) so the demo survives a refresh. Nothing is sent to a server.
      </p>
      <MockNotice>Connect the services in src/services to a real API (VITE_API_BASE_URL) to replace demo persistence with production storage.</MockNotice>
      <Button variant="danger" icon={RotateCcw} onClick={() => setOpen(true)}>
        Reset demo data
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Reset all demo data?"
        description="Every change made in this browser will be replaced with the original sample data."
        confirmLabel="Reset data"
        tone="danger"
        loading={reset.pending}
        onConfirm={async () => {
          const res = await reset.run()
          if (res.ok) setOpen(false)
        }}
      />
    </div>
  )
}

const SECTION_COMPONENTS = {
  users: UserManagement,
  roles: RolePermissions,
  departments: DepartmentSettings,
  workflows: WorkflowSettings,
  notifications: NotificationSettings,
  assessments: AssessmentTemplates,
  scorecards: ScorecardSettings,
  data: DemoDataSettings,
}

export default function SettingsPage() {
  const { section } = useParams()
  const { can, role } = useSession()
  const meta = SETTINGS_SECTIONS.find((s) => s.id === section)
  if (!meta) return <Navigate to="/settings/users" replace />
  const Section = SECTION_COMPONENTS[section]
  // Personal notification preferences stay editable for everyone.
  const readOnly = section !== 'notifications' && !can('settings.manage')

  return (
    <div>
      <PageHeader title="Settings" description="Configure users, permissions and recruitment building blocks." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <SettingsNav />
        <section aria-labelledby="settings-section-title" className="min-w-0">
          <div className="mb-4">
            <h2 id="settings-section-title" className="text-base font-semibold">
              {meta.label}
            </h2>
            <p className="text-muted text-sm">{meta.description}</p>
          </div>
          {readOnly && (
            <p className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <ShieldAlert size={16} aria-hidden /> You’re viewing as {role}. These settings are read-only for your role.
            </p>
          )}
          <Section readOnly={readOnly} />
        </section>
      </div>
    </div>
  )
}
