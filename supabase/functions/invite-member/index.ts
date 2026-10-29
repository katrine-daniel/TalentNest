// Invite a person to the caller's organization.
//
// NOT TESTED AGAINST A LIVE DEPLOYMENT (no credentials were available during development).
//
// Only callers with the `accounts.manage` permission (organization administrators) may invite.
// The service-role key is used server-side to send the Supabase Auth invitation and create the
// membership; it is a function secret and never reaches a browser.
import { adminClient, cors, json, userClient } from '../_shared/auth.ts'

const ROLES = ['employee', 'manager', 'hr_specialist', 'hr_admin', 'org_admin']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await userClient(req)
  if (!auth) return json({ error: 'Sign in required' }, 401)

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const { orgId, role, employeeId = null, fullName = '' } = body ?? {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Enter a valid email address' }, 400)
  if (!ROLES.includes(role)) return json({ error: 'Choose a valid role' }, 400)

  const { data: allowed } = await auth.client.rpc('has_permission', { p_org: orgId, p: 'accounts.manage' })
  if (!allowed) return json({ error: 'Only organization administrators can invite people' }, 403)

  const admin = adminClient()
  if (employeeId) {
    const { data: emp } = await admin.from('employees').select('id').eq('org_id', orgId).eq('id', employeeId).maybeSingle()
    if (!emp) return json({ error: 'Employee record not found in this organization' }, 400)
  }
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: Deno.env.get('SITE_URL') ?? undefined,
  })
  if (error || !invited.user) return json({ error: 'Could not send the invitation' }, 502)
  const { error: memberError } = await admin
    .from('memberships')
    .upsert({ org_id: orgId, user_id: invited.user.id, role, status: 'active', employee_id: employeeId }, { onConflict: 'org_id,user_id' })
  if (memberError) return json({ error: 'Invitation sent, but the membership could not be created' }, 500)
  return json({ userId: invited.user.id })
})
