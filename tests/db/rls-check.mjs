// Applies supabase/migrations to an in-memory Postgres (PGlite) with minimal stand-ins for Supabase's
// auth and storage schemas, then checks key RLS and trigger behaviour as different users.
// This verifies the SQL and policies on real Postgres; it is not a full Supabase environment
// (no PostgREST, GoTrue or Storage API). Run: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'

const db = new PGlite()
const STUBS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`
const GRANTS = `
grant usage on schema public, auth, storage to authenticated, anon;
grant all on all tables in schema public to authenticated;
grant all on storage.objects to authenticated;
grant execute on all functions in schema public, auth, storage to authenticated;
`
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}
async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}
async function fails(sql, params) {
  try {
    await db.query(sql, params)
    return null
  } catch (e) {
    return e.message
  }
}

await db.exec('create extension if not exists pgcrypto;').catch(() => {})
await db.exec(STUBS)
const dir = path.resolve(import.meta.dirname, '../../supabase/migrations')
for (const file of fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  // pgcrypto is built into PGlite's gen_random_uuid(); the extension itself is not bundled.
  await db.exec(fs.readFileSync(path.join(dir, file), 'utf8').replace(/create extension if not exists pgcrypto;/, ''))
}
await db.exec(GRANTS)
console.log('Migrations applied.')

const U = {
  admin: '00000000-0000-0000-0000-00000000000a',
  recruiter: '00000000-0000-0000-0000-00000000000b',
  interviewer: '00000000-0000-0000-0000-00000000000c',
  outsider: '00000000-0000-0000-0000-00000000000d',
}
for (const [name, id] of Object.entries(U))
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name}@example.test`, { full_name: name }])
check('profiles created by auth trigger', (await db.query('select count(*)::int n from public.profiles')).rows[0].n === 4)

const org = await as(U.admin, async () => (await db.query(`select public.create_organization('Acme Travel') id`)).rows[0].id)
const otherOrg = await as(U.outsider, async () => (await db.query(`select public.create_organization('Other Co') id`)).rows[0].id)
await db.query(`insert into public.memberships (org_id, user_id, role) values ($1, $2, 'Recruiter'), ($1, $3, 'Interviewer')`, [
  org,
  U.recruiter,
  U.interviewer,
])
await db.query(`insert into public.org_settings (org_id, role_permissions) values ($1, $2)`, [
  org,
  { Recruiter: ['candidates.manage', 'requisitions.create', 'candidates.notes.restricted', 'jobs.manage'], Interviewer: ['feedback.submit'] },
])

// Tenant isolation
await as(U.admin, () => db.query(`insert into public.departments (org_id, id, name) values ($1, 'dep-1', 'Sales')`, [org]))
check('outsider cannot read another org', (await as(U.outsider, () => db.query('select * from public.departments'))).rows.length === 0)
check(
  'outsider cannot write into another org',
  Boolean(
    await as(U.outsider, () =>
      fails(`insert into public.candidates (org_id, id, ref, first_name, last_name, email) values ($1, 'c-x', 'R', 'A', 'B', 'x@x.test')`, [org]),
    ),
  ),
)
check(
  'interviewer cannot change settings tables',
  Boolean(await as(U.interviewer, () => fails(`insert into public.departments (org_id, id, name) values ($1, 'dep-2', 'Ops')`, [org]))),
)
check('member directory view works', (await as(U.recruiter, () => db.query('select * from public.org_members where org_id = $1', [org]))).rows.length === 3)

// Requisition approvals
const reqSql = `insert into public.requisitions (org_id, id, title, department_id, headcount, budget_min, budget_max, approver_id, status, created_by_id) values ($1, $2, 'Analyst', 'dep-1', 1, 10, 20, $3, $4, $5)`
check('interviewer cannot raise a requisition', Boolean(await as(U.interviewer, () => fails(reqSql, [org, 'req-0', U.admin, 'pending', U.interviewer]))))
await as(U.recruiter, () => db.query(reqSql, [org, 'req-1', U.admin, 'pending', U.recruiter]))
const selfApprove = await as(U.recruiter, () => fails(`update public.requisitions set status = 'approved' where id = 'req-1'`))
check('recruiter cannot approve (no permission)', Boolean(selfApprove), selfApprove ?? '')
await as(U.admin, () => db.query(`update public.requisitions set status = 'approved' where id = 'req-1'`))
check('admin approves requisition', (await db.query(`select status from public.requisitions where id = 'req-1'`)).rows[0].status === 'approved')

// Publishing gate
const jobSql = `insert into public.jobs (org_id, id, title, status, requisition_id) values ($1, $2, 'Analyst', 'open', $3)`
check('cannot open a vacancy without approved requisition', Boolean(await as(U.recruiter, () => fails(jobSql, [org, 'job-0', null]))))
await as(U.recruiter, () => db.query(jobSql, [org, 'job-1', 'req-1']))
check('can open a vacancy from approved requisition', (await db.query(`select count(*)::int n from public.jobs where id = 'job-1'`)).rows[0].n === 1)

// Restricted notes
const notes = [
  { id: 'n1', text: 'team note', visibility: 'team' },
  { id: 'n2', text: 'salary history', visibility: 'restricted' },
]
await as(U.recruiter, () =>
  db.query(`insert into public.candidates (org_id, id, ref, first_name, last_name, email, notes) values ($1, 'c-1', 'TN-1', 'A', 'B', 'a@b.test', $2)`, [
    org,
    JSON.stringify(notes),
  ]),
)
const stored = (await db.query(`select notes from public.candidates where id = 'c-1'`)).rows[0].notes
check('restricted note removed from candidate row', stored.length === 1 && stored[0].id === 'n1')
check(
  'restricted note readable by permitted role',
  (await as(U.recruiter, () => db.query('select * from public.candidate_restricted_notes'))).rows.length === 1,
)
check('restricted note hidden from interviewer', (await as(U.interviewer, () => db.query('select * from public.candidate_restricted_notes'))).rows.length === 0)
await as(U.interviewer, () => db.query(`update public.candidates set notes = $1 where id = 'c-1'`, [JSON.stringify([notes[0]])]))
check('edit by non-permitted role keeps restricted note', (await db.query('select count(*)::int n from public.candidate_restricted_notes')).rows[0].n === 1)
await as(U.recruiter, () => db.query(`update public.candidates set notes = $1 where id = 'c-1'`, [JSON.stringify([notes[0]])]))
check('deleting a restricted note in the app removes it', (await db.query('select count(*)::int n from public.candidate_restricted_notes')).rows[0].n === 0)

// Scorecards
await as(U.recruiter, async () => {
  await db.query(`insert into public.applications (org_id, id, candidate_id, job_id, stage_id, status) values ($1, 'a-1', 'c-1', 'job-1', 's1', 'active')`, [
    org,
  ])
  await db.query(
    `insert into public.interviews (org_id, id, application_id, candidate_id, job_id, start, duration_min, interviewer_ids, status) values ($1, 'i-1', 'a-1', 'c-1', 'job-1', now(), 45, $2, 'completed')`,
    [org, JSON.stringify([U.interviewer])],
  )
})
const fbSql = `insert into public.interview_feedback (org_id, id, interview_id, interviewer_id, status) values ($1, $2, 'i-1', $3, 'draft')`
check('cannot write a scorecard for someone else', Boolean(await as(U.recruiter, () => fails(fbSql, [org, 'f-0', U.interviewer]))))
await as(U.interviewer, () => db.query(fbSql, [org, 'f-1', U.interviewer]))
check('panelist writes own scorecard', (await db.query(`select count(*)::int n from public.interview_feedback`)).rows[0].n === 1)
await as(U.interviewer, () => db.query(`update public.interview_feedback set status = 'submitted' where id = 'f-1'`))
check(
  'submitted scorecard cannot return to draft',
  Boolean(await as(U.interviewer, () => fails(`update public.interview_feedback set status = 'draft' where id = 'f-1'`))),
)

// Notifications
await as(U.recruiter, () =>
  db.query(`insert into public.notifications (org_id, id, title, user_id) values ($1, 'no-1', 'for admin', $2), ($1, 'no-2', 'everyone', null)`, [
    org,
    U.admin,
  ]),
)
check(
  'notifications only visible to recipient',
  (await as(U.interviewer, () => db.query('select id from public.notifications'))).rows.map((r) => r.id).join() === 'no-2',
)

// Automation
check(
  'interviewer cannot create automation rules',
  Boolean(
    await as(U.interviewer, () => fails(`insert into public.automation_rules (org_id, id, name, trigger) values ($1, 'r-1', 'x', 'stage.changed')`, [org])),
  ),
)
await as(U.recruiter, () => db.query(`insert into public.tasks (org_id, id, title, status, source_key) values ($1, 't-1', 'x', 'open', 'rule:k')`, [org]))
check(
  'automation task de-duplicated by source_key',
  Boolean(
    await as(U.recruiter, () => fails(`insert into public.tasks (org_id, id, title, status, source_key) values ($1, 't-2', 'x', 'open', 'rule:k')`, [org])),
  ),
)

// Memberships
check(
  'non-admin cannot change roles',
  (await as(U.recruiter, () => db.query(`update public.memberships set role = 'Admin' where user_id = $1 returning *`, [U.recruiter]))).rows.length === 0,
)
check(
  'admin cannot demote themself',
  Boolean(await as(U.admin, () => fails(`update public.memberships set role = 'Recruiter' where user_id = $1 and org_id = $2`, [U.admin, org]))),
)

// Storage
await as(U.recruiter, () => db.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [`${org}/resumes/a.pdf`]))
check('member uploads into own org folder', true)
check(
  'cannot upload into another org folder',
  Boolean(await as(U.recruiter, () => fails(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [`${otherOrg}/resumes/b.pdf`]))),
)
check('outsider cannot list org documents', (await as(U.outsider, () => db.query(`select * from storage.objects`))).rows.length === 0)

// Audit
check('audit log records changes', (await db.query(`select count(*)::int n from public.audit_log where org_id = $1`, [org])).rows[0].n > 5)
check('only admins read audit log', (await as(U.recruiter, () => db.query('select * from public.audit_log'))).rows.length === 0)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exitCode = failures ? 1 : 0
