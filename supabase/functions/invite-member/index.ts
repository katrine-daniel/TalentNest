// Invites a teammate to the caller's organization (Supabase Edge Function, Deno).
//
// UNTESTED against a live deployment — review before production use.
//
// Only callers holding `settings.manage` in the organization may invite. The service-role key is
// used server-side to send the Supabase Auth invitation and create the membership.
import { adminClient, cors, json, userClient } from '../_shared/auth.ts'

const ROLES = ['Admin', 'Recruiter', 'Hiring Manager', 'Interviewer']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await userClient(req)
  if (!auth) return json({ error: 'Sign in required' }, 401)

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const { orgId, role, departmentId = null, fullName = '' } = body ?? {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address' }, 400)
  if (!ROLES.includes(role)) return json({ error: 'Choose a valid role' }, 400)

  const { data: allowed } = await auth.client.rpc('has_org_permission', { p_org: orgId, p_permission: 'settings.manage' })
  if (!allowed) return json({ error: 'Only administrators can invite teammates' }, 403)

  const admin = adminClient()
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: Deno.env.get('SITE_URL') ?? undefined,
  })
  if (error || !invited.user) return json({ error: 'Could not send the invitation' }, 502)

  const { error: memberError } = await admin
    .from('memberships')
    .upsert({ org_id: orgId, user_id: invited.user.id, role, status: 'invited', department_id: departmentId }, { onConflict: 'org_id,user_id' })
  if (memberError) return json({ error: 'Invitation sent, but the membership could not be created' }, 500)

  return json({ userId: invited.user.id, status: 'invited' })
})
