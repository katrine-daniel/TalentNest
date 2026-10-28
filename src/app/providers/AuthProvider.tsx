import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dataStore } from '@/services/storage/dataStore'
import { createDemoDriver } from '@/services/storage/demoDriver'
import { createSupabaseDriver } from '@/services/storage/supabaseDriver'
import { fileStorage } from '@/services/storage/fileStorage'
import { installAutomation } from '@/features/automation/automationService'

// Rules react to events published by services in this app session.
installAutomation()
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import * as auth from '@/services/auth/authService'

export type AuthStatus = 'loading' | 'signed-out' | 'expired' | 'needs-organization' | 'signed-in'

export interface AuthState {
  status: AuthStatus
  mode: 'demo' | 'supabase' | null
  userId: string | null
  email: string | null
  orgName: string | null
  backendConfigured: boolean
  error: string | null
}

interface AuthContextValue extends AuthState {
  signInDemo(userId: string): Promise<void>
  signIn(email: string, password: string): Promise<void>
  signUp(input: { email: string; password: string; fullName: string; organizationName: string }): Promise<{ needsConfirmation: boolean }>
  createOrganization(name: string): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const initial: AuthState = { status: 'loading', mode: null, userId: null, email: null, orgName: null, backendConfigured: isSupabaseConfigured(), error: null }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initial)
  const manualSignOut = useRef(false)

  const enterSupabaseOrg = useCallback(async (userId: string, email: string | null) => {
    const client = getSupabase()
    if (!client) return
    const memberships = await auth.fetchMemberships()
    const membership = memberships[0]
    if (!membership) {
      setState((s) => ({ ...s, status: 'needs-organization', mode: 'supabase', userId, email }))
      return
    }
    fileStorage.useSupabase(client, membership.orgId)
    await dataStore.connect(createSupabaseDriver({ client, orgId: membership.orgId, userId }), { force: true })
    setState((s) => ({ ...s, status: 'signed-in', mode: 'supabase', userId, email, orgName: membership.orgName, error: null }))
  }, [])

  // Restore an existing session on start-up.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = await auth.getSupabaseSession()
        if (cancelled) return
        if (session) {
          await enterSupabaseOrg(session.user.id, session.user.email ?? null)
          return
        }
        const demo = auth.readDemoSession()
        if (demo === 'expired') {
          setState((s) => ({ ...s, status: 'expired' }))
        } else if (demo) {
          fileStorage.useDemo()
          await dataStore.connect(createDemoDriver())
          setState((s) => ({ ...s, status: 'signed-in', mode: 'demo', userId: demo.userId, orgName: 'Skyline Voyages Group (demo)' }))
        } else {
          setState((s) => ({ ...s, status: 'signed-out' }))
        }
      } catch (error) {
        if (!cancelled) setState((s) => ({ ...s, status: 'signed-out', error: error instanceof Error ? error.message : 'Sign-in failed' }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enterSupabaseOrg])

  // React to Supabase session changes (token expiry, sign-out in another tab).
  useEffect(() => {
    const client = getSupabase()
    if (!client) return
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        dataStore.disconnect()
        setState((s) => (s.mode === 'supabase' ? { ...initial, status: manualSignOut.current ? 'signed-out' : 'expired' } : s))
        manualSignOut.current = false
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Demo sessions expire too, so the expired-session state is exercised in demo mode.
  useEffect(() => {
    if (state.mode !== 'demo' || state.status !== 'signed-in') return
    const timer = window.setInterval(() => {
      if (auth.readDemoSession() === 'expired') {
        dataStore.disconnect()
        setState({ ...initial, status: 'expired' })
      }
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [state.mode, state.status])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      async signInDemo(userId) {
        auth.startDemoSession(userId)
        fileStorage.useDemo()
        await dataStore.connect(createDemoDriver(), { force: true })
        setState({ ...initial, status: 'signed-in', mode: 'demo', userId, orgName: 'Skyline Voyages Group (demo)' })
      },
      async signIn(email, password) {
        const session = await auth.signIn(email, password)
        if (session) await enterSupabaseOrg(session.user.id, session.user.email ?? null)
      },
      async signUp(input) {
        const { session, needsConfirmation } = await auth.signUp(input)
        if (session) {
          await auth.createOrganization(input.organizationName)
          await enterSupabaseOrg(session.user.id, session.user.email ?? null)
        }
        return { needsConfirmation }
      },
      async createOrganization(name) {
        await auth.createOrganization(name)
        if (state.userId) await enterSupabaseOrg(state.userId, state.email)
      },
      async signOut() {
        await dataStore.flush()
        if (state.mode === 'supabase') {
          manualSignOut.current = true
          await auth.signOut()
        }
        auth.endDemoSession()
        dataStore.disconnect()
        setState({ ...initial, status: 'signed-out' })
      },
    }),
    [state, enterSupabaseOrg],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
