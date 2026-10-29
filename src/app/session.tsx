/**
 * Authentication and session.
 *
 * - Demo mode (no Supabase configured): pick a fictional account; the session is stored in this
 *   browser for 12 hours. It authenticates nobody and is clearly labelled as a demo.
 * - Supabase mode: email/password sign-in, password reset and organization membership through
 *   Supabase Auth; data access is enforced by row-level security in the database.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isSupabaseConfigured, STORAGE_KEYS } from '@/config/env'
import { can, type Permission } from '@/domain/permissions'
import type { Account } from '@/domain/types'
import { createDemoDriver, resetDemoData } from '@/services/demoDriver'
import { store } from '@/services/store'
import { installAutomation, setAutomationSession, stopScheduler } from '@/services/automation'
import { useDb } from './hooks'

export const DEMO_SESSION_TTL = 12 * 60 * 60 * 1000

type Status = 'loading' | 'signed-out' | 'signed-in' | 'expired' | 'error'

interface AuthState {
  status: Status
  mode: 'demo' | 'supabase'
  accountId: string | null
  error: string | null
}

interface AuthApi extends AuthState {
  signInDemo(accountId: string): Promise<void>
  signOut(): Promise<void>
  resetDemo(): Promise<void>
}

const AuthCtx = createContext<AuthApi | null>(null)

function readDemoSession(): { accountId: string } | 'expired' | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.demoSession)
    if (!raw) return null
    const s = JSON.parse(raw) as { accountId: string; expiresAt: number }
    if (typeof s.accountId !== 'string') return null
    if (s.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_KEYS.demoSession)
      return 'expired'
    }
    return { accountId: s.accountId }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', mode: isSupabaseConfigured ? 'supabase' : 'demo', accountId: null, error: null })

  const startDemo = useCallback(async (accountId: string) => {
    await store.connect(createDemoDriver())
    const account = store.getState().db?.accounts.find((a) => a.id === accountId && a.status === 'active')
    if (!account) {
      localStorage.removeItem(STORAGE_KEYS.demoSession)
      setState({ status: 'signed-out', mode: 'demo', accountId: null, error: null })
      return
    }
    setAutomationSession(accountId)
    installAutomation({ scheduleInBrowser: true })
    setState({ status: 'signed-in', mode: 'demo', accountId, error: null })
  }, [])

  useEffect(() => {
    if (isSupabaseConfigured) {
      let cancelled = false
      void import('@/services/supabaseSession').then(({ watchSupabaseSession }) => {
        if (cancelled) return
        watchSupabaseSession((next) => setState((s) => ({ ...s, mode: 'supabase', ...next })))
      })
      return () => {
        cancelled = true
      }
    }
    const s = readDemoSession()
    if (s === 'expired') setState((x) => ({ ...x, status: 'expired' }))
    else if (s) void startDemo(s.accountId)
    else setState((x) => ({ ...x, status: 'signed-out' }))
  }, [startDemo])

  // Keep the demo session valid while the app is in use; end it when it lapses.
  useEffect(() => {
    if (state.mode !== 'demo' || state.status !== 'signed-in') return
    const t = setInterval(() => {
      if (readDemoSession() === 'expired') {
        stopScheduler()
        setAutomationSession(null)
        store.disconnect()
        setState({ status: 'expired', mode: 'demo', accountId: null, error: null })
      }
    }, 60_000)
    return () => clearInterval(t)
  }, [state.mode, state.status])

  const api = useMemo<AuthApi>(
    () => ({
      ...state,
      async signInDemo(accountId) {
        localStorage.setItem(STORAGE_KEYS.demoSession, JSON.stringify({ accountId, expiresAt: Date.now() + DEMO_SESSION_TTL }))
        await startDemo(accountId)
      },
      async signOut() {
        await store.flush()
        stopScheduler()
        setAutomationSession(null)
        if (state.mode === 'supabase') {
          const { supabaseSignOut } = await import('@/services/supabaseSession')
          await supabaseSignOut()
        }
        localStorage.removeItem(STORAGE_KEYS.demoSession)
        store.disconnect()
        setState({ status: 'signed-out', mode: state.mode, accountId: null, error: null })
      },
      async resetDemo() {
        if (state.mode !== 'demo' || !state.accountId) return
        resetDemoData()
        await startDemo(state.accountId)
      },
    }),
    [state, startDemo],
  )

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export interface Session {
  account: Account
  mode: 'demo' | 'supabase'
  can(permission: Permission): boolean
}

/** The signed-in account. Only valid inside authenticated routes. */
export function useSession(): Session {
  const { accountId, mode } = useAuth()
  const db = useDb()
  const account = db.accounts.find((a) => a.id === accountId)
  if (!account) throw new Error('Signed-in account not found')
  return { account, mode, can: (p) => can(account, p) }
}
