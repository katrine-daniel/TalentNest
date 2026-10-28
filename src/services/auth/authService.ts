/**
 * Authentication service.
 *
 * - Supabase mode: email/password auth, password reset and organization membership
 *   through Supabase Auth. Authorization is enforced by Row Level Security.
 * - Demo mode: a local, clearly labelled session for exploring the sample workspace.
 *   It authenticates nobody and is only offered alongside the demo data set.
 */
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import { DEMO_SESSION_KEY } from '@/config/env'
import type { Role } from '@/types/domain'

export const DEMO_SESSION_TTL_MS = 12 * 60 * 60 * 1000

export interface DemoSession {
  mode: 'demo'
  userId: string
  expiresAt: number
}

export interface Membership {
  orgId: string
  orgName: string
  role: Role
}

export class AuthError extends Error {}

function requireClient() {
  const client = getSupabase()
  if (!client) throw new AuthError('Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return client
}

// ---------------------------------------------------------------- demo sessions
export function readDemoSession(now = Date.now()): DemoSession | 'expired' | null {
  try {
    const raw = localStorage.getItem(DEMO_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemoSession
    if (parsed.mode !== 'demo' || typeof parsed.userId !== 'string') return null
    if (parsed.expiresAt < now) {
      localStorage.removeItem(DEMO_SESSION_KEY)
      return 'expired'
    }
    return parsed
  } catch {
    return null
  }
}

export function startDemoSession(userId: string, now = Date.now()): DemoSession {
  const session: DemoSession = { mode: 'demo', userId, expiresAt: now + DEMO_SESSION_TTL_MS }
  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session))
  return session
}

export function endDemoSession() {
  localStorage.removeItem(DEMO_SESSION_KEY)
}

// ---------------------------------------------------------------- supabase auth
export async function getSupabaseSession(): Promise<Session | null> {
  const client = getSupabase()
  if (!client) return null
  const { data, error } = await client.auth.getSession()
  if (error) throw new AuthError(error.message)
  return data.session
}

export async function signIn(email: string, password: string) {
  const { data, error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password })
  // Never reveal whether the email exists.
  if (error) throw new AuthError(error.status === 400 ? 'Incorrect email or password.' : 'Sign-in failed. Please try again.')
  return data.session
}

export async function signUp({ email, password, fullName, organizationName }: { email: string; password: string; fullName: string; organizationName: string }) {
  const { data, error } = await requireClient().auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: fullName.trim(), organization_name: organizationName.trim() },
      emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
    },
  })
  if (error) throw new AuthError(error.message)
  // When email confirmation is enabled there is no session until the link is clicked.
  return { session: data.session, needsConfirmation: !data.session }
}

export async function requestPasswordReset(email: string) {
  const { error } = await requireClient().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
  })
  // Respond identically whether or not the account exists.
  if (error && error.status !== 400) throw new AuthError('Could not send the reset email. Try again later.')
}

export async function updatePassword(password: string) {
  const { error } = await requireClient().auth.updateUser({ password })
  if (error) throw new AuthError(error.message)
}

export async function signOut() {
  const client = getSupabase()
  if (client) await client.auth.signOut()
}

/** Organizations the signed-in user belongs to (RLS returns only their own memberships). */
export async function fetchMemberships(): Promise<Membership[]> {
  const { data, error } = await requireClient().from('memberships').select('org_id, role, organizations(name)').eq('status', 'active')
  if (error) throw new AuthError(`Could not load your organization: ${error.message}`)
  return (data ?? []).map((m: { org_id: string; role: Role; organizations: { name: string } | { name: string }[] | null }) => ({
    orgId: m.org_id,
    role: m.role,
    orgName: Array.isArray(m.organizations) ? (m.organizations[0]?.name ?? 'Organization') : (m.organizations?.name ?? 'Organization'),
  }))
}

/** Creates an organization owned by the current user (security-definer RPC in the database). */
export async function createOrganization(name: string): Promise<string> {
  const { data, error } = await requireClient().rpc('create_organization', { org_name: name.trim() })
  if (error) throw new AuthError(error.message)
  return data as string
}
