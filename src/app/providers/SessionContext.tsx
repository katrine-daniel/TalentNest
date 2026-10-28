import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useCollection, useSettings } from '@/hooks/useStore'
import { hasPermission, DEFAULT_ROLE_PERMISSIONS, type Permission } from '@/utils/permissions'
import { useAuth } from './AuthProvider'
import type { Role, User } from '@/types/domain'

/**
 * The signed-in user as seen by the UI, plus permission checks.
 * Permissions here only decide what the interface offers; the database enforces
 * the same rules with Row Level Security (see supabase/migrations).
 */
interface SessionValue {
  user: User
  role: Role
  actorId: string
  mode: 'demo' | 'supabase'
  orgName: string
  can(permission: Permission): boolean
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const authState = useAuth()
  const users = useCollection('users') as User[]
  const settings = useSettings()
  const matrix = settings?.rolePermissions ?? DEFAULT_ROLE_PERMISSIONS

  const user: User = useMemo(
    () =>
      users.find((u) => u.id === authState.userId) ?? {
        id: authState.userId ?? 'unknown',
        name: authState.email ?? 'Signed-in user',
        email: authState.email ?? '',
        title: '',
        // Unknown users get the least-privileged role until their membership loads.
        role: 'Interviewer',
        departmentId: null,
        status: 'active',
      },
    [users, authState.userId, authState.email],
  )

  const can = useCallback((permission: Permission) => user.status === 'active' && hasPermission(matrix, user.role, permission), [matrix, user])

  const value = useMemo<SessionValue>(
    () => ({ user, role: user.role, actorId: user.id, mode: authState.mode ?? 'demo', orgName: authState.orgName ?? '', can }),
    [user, authState.mode, authState.orgName, can],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
