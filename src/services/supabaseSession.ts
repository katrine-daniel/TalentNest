/**
 * Supabase authentication and session wiring (loaded only when Supabase is configured).
 */
import { env } from '@/config/env'
import { getSupabase } from '@/lib/supabase'
import { createSupabaseDriver } from './supabaseDriver'
import { setAssistantTokenGetter } from './assistant'
import { installAutomation, setAutomationSession } from './automation'
import { isHR } from '@/domain/permissions'
import { files } from './files'
import { ServiceError, store } from './store'

type Update = { status: 'loading' | 'signed-out' | 'signed-in' | 'expired' | 'error'; accountId: string | null; error: string | null }

function client() {
  const c = getSupabase()
  if (!c) throw new ServiceError('Authentication is not configured.', 'unavailable')
  return c
}

async function connect(userId: string): Promise<Update> {
  const c = client()
  const { data, error } = await c.from('memberships').select('org_id, status').eq('user_id', userId).eq('status', 'active').limit(1)
  if (error) return { status: 'error', accountId: null, error: `Could not load your organization: ${error.message}` }
  const orgId = data?.[0]?.org_id as string | undefined
  if (!orgId)
    return { status: 'error', accountId: null, error: 'Your account is not a member of an organization yet. Ask your administrator for an invitation.' }
  files.use({
    async put(id, file) {
      const { error: e } = await c.storage.from('documents').upload(`${orgId}/${id}`, file, { upsert: false, contentType: file.type || undefined })
      if (e) throw new ServiceError(`Upload failed: ${e.message}`, 'unavailable')
    },
    async open(id) {
      const { data: d, error: e } = await c.storage.from('documents').createSignedUrl(`${orgId}/${id}`, 60)
      if (e || !d) throw new ServiceError('You do not have access to this file, or it no longer exists.', 'forbidden')
      return d.signedUrl
    },
    async remove(id) {
      await c.storage.from('documents').remove([`${orgId}/${id}`])
    },
  })
  setAssistantTokenGetter(async () => (await c.auth.getSession()).data.session?.access_token ?? null)
  await store.connect(createSupabaseDriver(c, orgId))
  if (store.getState().status === 'error') return { status: 'error', accountId: null, error: store.getState().error }
  // Event rules run in this browser after each change; scheduled checks run on the server.
  // There is no server-side scheduler: scheduled checks (joins, leavers, overdue work, expiring documents,
  // retries) run in the browser of signed-in HR users, whose permissions cover the records they change.
  setAutomationSession(userId)
  const me = store.getState().db?.accounts.find((a) => a.id === userId)
  installAutomation({ scheduleInBrowser: isHR(me) })
  return { status: 'signed-in', accountId: userId, error: null }
}

export function watchSupabaseSession(onChange: (u: Update) => void) {
  const c = client()
  let current: string | null = null
  const handle = async (userId: string | null, expired = false) => {
    if (userId === current) return
    current = userId
    if (!userId) {
      store.disconnect()
      onChange({ status: expired ? 'expired' : 'signed-out', accountId: null, error: null })
      return
    }
    onChange({ status: 'loading', accountId: null, error: null })
    onChange(await connect(userId))
  }
  void c.auth.getSession().then(({ data }) => handle(data.session?.user.id ?? null))
  c.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') return
    void handle(session?.user.id ?? null, event === 'SIGNED_OUT' && current !== null)
  })
}

export async function supabaseSignIn(email: string, password: string) {
  const { error } = await client().auth.signInWithPassword({ email: email.trim(), password })
  // Same message whether the email exists or not.
  if (error) throw new ServiceError(error.status === 400 ? 'Incorrect email or password.' : 'Sign-in failed. Please try again.')
}

export async function supabaseSignOut() {
  await client().auth.signOut()
}

export async function sendPasswordReset(email: string) {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
  })
  if (error && error.status !== 400) throw new ServiceError('Could not send the reset email. Try again later.')
}

export async function updatePassword(password: string) {
  if (password.length < 10) throw new ServiceError('Use at least 10 characters.')
  const { error } = await client().auth.updateUser({ password })
  if (error) throw new ServiceError(error.message)
}

/** Invites a person through the `invite-member` Edge Function (organization administrators only). */
export async function inviteMember(input: { email: string; role: string; employeeId: string | null; fullName: string }) {
  const c = client()
  const token = (await c.auth.getSession()).data.session?.access_token
  const orgId = store.getState().db?.organization.id
  if (!token || !orgId) throw new ServiceError('Sign in again to invite people.', 'forbidden')
  const res = await fetch(`${env.supabaseUrl}/functions/v1/invite-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: env.supabaseAnonKey },
    body: JSON.stringify({ ...input, orgId }),
  }).catch(() => null)
  if (!res) throw new ServiceError('The invitation service could not be reached. Is the invite-member function deployed?', 'unavailable')
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ServiceError(body.error ?? `Invitation failed (${res.status}).`, res.status === 403 ? 'forbidden' : 'unavailable')
}
