import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import LoadingState from '@/components/ui/LoadingState'
import { useAuth } from './providers/AuthProvider'
import { useSession } from './providers/SessionContext'
import type { Permission } from '@/utils/permissions'

function FullScreenLoader() {
  return (
    <div className="mx-auto max-w-5xl p-8">
      <LoadingState />
    </div>
  )
}

/** Routes that require a signed-in member of an organization. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'needs-organization') return <Navigate to="/setup-organization" replace />
  if (status !== 'signed-in') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

/** Auth screens bounce signed-in users back into the app. */
export function GuestOnly() {
  const { status } = useAuth()
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'signed-in') return <Navigate to="/" replace />
  return <Outlet />
}

/**
 * Hides a screen from roles without the permission. This is a UX guard only —
 * the data itself is protected by database policies.
 */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can, role } = useSession()
  if (can(permission)) return <>{children}</>
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={Lock}
        title="You don't have access to this page"
        description={`Your role (${role}) doesn't include this permission. Ask an administrator if you need access.`}
        action={<Button to="/">Back to overview</Button>}
      />
    </div>
  )
}
