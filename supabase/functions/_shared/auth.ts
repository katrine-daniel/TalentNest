// Shared helpers for PeopleOS Edge Functions (Deno).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'

export const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Client acting as the calling user, so row-level security applies. Null when the JWT is missing or invalid. */
export async function userClient(req: Request): Promise<{ client: SupabaseClient; userId: string } | null> {
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return { client, userId: data.user.id }
}

/** Service-role client — server-side only; the key is a function secret and never reaches a browser. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
}

const hits = new Map<string, number[]>()
/** Best-effort per-instance rate limit (requests per minute per user). */
export function rateLimited(userId: string, perMinute: number): boolean {
  const now = Date.now()
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(userId, recent)
  return recent.length > perMinute
}
