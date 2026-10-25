import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useCollection, useSettings } from '@/hooks/useStore'
import { hasPermission, DEFAULT_ROLE_PERMISSIONS } from '@/utils/permissions'

/**
 * Demo session. There is no authentication in this frontend — the signed-in user
 * is a fixed demo account and "View as role" only changes which UI is offered.
 * A real deployment must authenticate users and enforce permissions server-side.
 */
const SessionContext = createContext(null)

const DEMO_USER_ID = 'usr-01'

export function SessionProvider({ children }) {
  const users = useCollection('users')
  const settings = useSettings()
  const [viewAsRole, setViewAsRole] = useState(null)

  const user = users.find((u) => u.id === DEMO_USER_ID) ?? {
    id: DEMO_USER_ID,
    name: 'Katrine Daniel',
    title: 'Head of Talent Acquisition',
    role: 'Admin',
    email: 'katrine.daniel@skylinevoyages.example',
  }
  const role = viewAsRole ?? user.role
  const matrix = settings?.rolePermissions ?? DEFAULT_ROLE_PERMISSIONS

  const can = useCallback((permission) => hasPermission(matrix, role, permission), [matrix, role])

  const value = useMemo(
    () => ({ user, role, actualRole: user.role, viewAsRole, setViewAsRole, can, actorId: user.id }),
    [user, role, viewAsRole, can],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
