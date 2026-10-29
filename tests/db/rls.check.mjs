// Applies supabase/migrations to an in-memory Postgres (PGlite) with minimal stand-ins for Supabase's
// auth and storage schemas, then checks row-level security and the business-rule triggers as
// different users. This verifies the SQL on real Postgres; it is not a full Supabase stack
// (no PostgREST, GoTrue or Storage API). Run: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'

const db = new PGlite()
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`)
const dir = path.resolve(import.meta.dirname, '../../supabase/migrations')
for (const f of fs
  .readdirSync(dir)
  .filter((x) => x.endsWith('.sql'))
  .sort())
  await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
await db.exec(`
grant usage on schema public, auth, storage to authenticated;
grant all on all tables in schema public to authenticated;
grant all on storage.objects to authenticated;
grant execute on all functions in schema public, auth, storage to authenticated;
`)
console.log('Migrations applied.\n')

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}
const U = {
  admin: 'a0000000-0000-0000-0000-000000000001',
  hr: 'a0000000-0000-0000-0000-000000000002',
  mgr: 'a0000000-0000-0000-0000-000000000003',
  emp: 'a0000000-0000-0000-0000-000000000004',
  oth: 'a0000000-0000-0000-0000-000000000005',
  out: 'a0000000-0000-0000-0000-000000000006',
}
async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}
const q = (sql, params) => db.query(sql, params)
const denied = async (uid, sql, params) => {
  try {
    const r = await as(uid, () => q(sql, params))
    return r.affectedRows === 0 // RLS filtered the row out
  } catch {
    return true
  }
}
const rows = async (uid, sql, params) => (await as(uid, () => q(sql, params))).rows

for (const [k, id] of Object.entries(U))
  await q('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, `${k}@example.test`, { full_name: k }])
const org = (await as(U.admin, () => q(`select public.create_organization('Acme') id`))).rows[0].id
const other = (await as(U.out, () => q(`select public.create_organization('Other') id`))).rows[0].id
await q(
  `insert into public.memberships (org_id, user_id, role, employee_id) values ($1,$2,'hr_specialist','e_hr'),($1,$3,'manager','e_mgr'),($1,$4,'employee','e_emp'),($1,$5,'employee','e_oth')`,
  [org, U.hr, U.mgr, U.emp, U.oth],
)

// Seed as superuser: departments, employees and their restricted parts.
const ins = (table, id, data, o = org) => q(`insert into public.${table} (org_id, id, data) values ($1, $2, $3)`, [o, id, data])
await ins('departments', 'd1', { name: 'Ops' })
await ins('departments', 'd2', { name: 'Finance' })
for (const [id, manager, dept] of [
  ['e_hr', null, 'd1'],
  ['e_mgr', null, 'd1'],
  ['e_emp', 'e_mgr', 'd1'],
  ['e_oth', null, 'd2'],
]) {
  await ins('employees', id, { firstName: id, lastName: 'X', workEmail: `${id}@acme.test`, managerId: manager, departmentId: dept, status: 'active' })
  await ins('employee_private', id, { phone: `+1 555 ${id}`, personalEmail: null, dateOfBirth: '1990-01-01', emergencyContact: null })
  await ins('employee_records', id, { documents: [{ id: 'doc0', name: 'contract.pdf' }], equipment: [], history: [{ id: 'h0', field: 'Record' }] })
}
await ins('leave_types', 'lt_annual', { name: 'Annual', approvalChain: [{ id: 's', name: 'Manager', rule: 'manager' }] })

// ---- tenancy & directory
check('outsider sees no employees of another organization', (await rows(U.out, 'select * from public.employees')).length === 0)
check('employees can read the work directory', (await rows(U.emp, 'select * from public.employees')).length === 4)
check('employees read only their own personal data', (await rows(U.emp, 'select id from public.employee_private')).map((r) => r.id).join() === 'e_emp')
check('managers cannot read reports’ personal data', (await rows(U.mgr, `select id from public.employee_private where id = 'e_emp'`)).length === 0)
check('HR reads all personal data', (await rows(U.hr, 'select id from public.employee_private')).length === 4)
check('managers read their reports’ employment records', (await rows(U.mgr, `select id from public.employee_records where id = 'e_emp'`)).length === 1)
check('colleagues cannot read employment records', (await rows(U.oth, `select id from public.employee_records where id = 'e_emp'`)).length === 0)
check('employees cannot edit the directory', await denied(U.emp, `update public.employees set data = data || '{"title":"CEO"}' where id = 'e_emp'`))
const docs = JSON.stringify({
  documents: [
    { id: 'doc0', name: 'contract.pdf' },
    { id: 'doc1', name: 'id.pdf' },
  ],
  equipment: [],
  history: [{ id: 'h0', field: 'Record' }],
})
check('employees can add a document to their own record', !(await denied(U.emp, `update public.employee_records set data = $1 where id = 'e_emp'`, [docs])))
check(
  'employees cannot rewrite their history',
  await denied(U.emp, `update public.employee_records set data = jsonb_set(data, '{history}', '[]') where id = 'e_emp'`),
)

// ---- service requests
const steps = (approver) => [
  {
    id: 'st1',
    stageName: 'Manager',
    rule: 'manager',
    approverIds: [approver],
    delegatedTo: null,
    decision: 'pending',
    decidedBy: null,
    decidedAt: null,
    comment: '',
  },
]
const req = (requester, employee, status, approvals = []) => ({
  number: 'HR-1',
  typeId: 't',
  subject: 'S',
  description: '',
  requesterId: requester,
  employeeId: employee,
  priority: 'normal',
  status,
  assigneeId: null,
  dueAt: '2030-01-01',
  approvals,
  comments: [],
  timeline: [],
  proposedChanges: null,
})
const asInsert = (uid, id, data) => as(uid, () => q(`insert into public.hr_requests (org_id, id, data) values ($1, $2, $3)`, [org, id, data]))
await asInsert(U.emp, 'r1', req(U.emp, 'e_emp', 'pending_approval', steps(U.mgr)))
check(
  'employees cannot raise requests for someone else',
  await denied(U.emp, `insert into public.hr_requests (org_id, id, data) values ($1, 'r2', $2)`, [org, req(U.emp, 'e_oth', 'open')]),
)
check(
  'requests are private to the requester, approvers, line managers and HR',
  (await rows(U.oth, `select id from public.hr_requests`)).length === 0 && (await rows(U.mgr, `select id from public.hr_requests`)).length === 1,
)
check('employees cannot assign or reprioritize', await denied(U.emp, `update public.hr_requests set data = data || '{"priority":"urgent"}' where id = 'r1'`))
check('employees cannot approve their own request', await denied(U.emp, `update public.hr_requests set data = data || '{"status":"approved"}' where id = 'r1'`))
const decided = (by) => JSON.stringify([{ ...steps(U.mgr)[0], decision: 'approved', decidedBy: by, decidedAt: '2030-01-01' }])
check(
  'approvals are recorded only under the approver’s own name',
  await denied(U.mgr, `update public.hr_requests set data = data || jsonb_build_object('status','approved','approvals',$1::jsonb) where id = 'r1'`, [
    decided(U.hr),
  ]),
)
check(
  'the approver can approve',
  !(await denied(U.mgr, `update public.hr_requests set data = data || jsonb_build_object('status','approved','approvals',$1::jsonb) where id = 'r1'`, [
    decided(U.mgr),
  ])),
)
await asInsert(U.mgr, 'r3', req(U.mgr, 'e_mgr', 'pending_approval', steps(U.mgr)))
check(
  'nobody approves a request about themselves',
  await denied(U.mgr, `update public.hr_requests set data = data || jsonb_build_object('status','approved','approvals',$1::jsonb) where id = 'r3'`, [
    decided(U.mgr),
  ]),
)
await asInsert(U.emp, 'r4', req(U.emp, 'e_emp', 'open'))
check('employees can cancel their own request', !(await denied(U.emp, `update public.hr_requests set data = data || '{"status":"cancelled"}' where id = 'r4'`)))
await q(`insert into public.request_internal_notes (org_id, id, data) values ($1, 'n1', '{"requestId":"r4","text":"internal"}')`, [org])
check(
  'internal notes are hidden from employees and managers',
  (await rows(U.emp, 'select * from public.request_internal_notes')).length === 0 &&
    (await rows(U.mgr, 'select * from public.request_internal_notes')).length === 0,
)
check('HR reads internal notes', (await rows(U.hr, 'select * from public.request_internal_notes')).length === 1)

// ---- leave
const leave = (status, approvals) => ({
  employeeId: 'e_emp',
  leaveTypeId: 'lt_annual',
  startDate: '2099-06-01',
  endDate: '2099-06-03',
  days: 3,
  status,
  approvals,
  timeline: [],
  requestedBy: U.emp,
})
check(
  'leave that needs approval cannot be inserted as approved',
  await denied(U.emp, `insert into public.leave_requests (org_id, id, data) values ($1, 'l0', $2)`, [org, leave('approved', steps(U.mgr))]),
)
await as(U.emp, () => q(`insert into public.leave_requests (org_id, id, data) values ($1, 'l1', $2)`, [org, leave('pending', steps(U.mgr))]))
check('employees cannot change dates after submitting', await denied(U.emp, `update public.leave_requests set data = data || '{"days":1}' where id = 'l1'`))
check(
  'the manager approves leave',
  !(await denied(U.mgr, `update public.leave_requests set data = data || jsonb_build_object('status','approved','approvals',$1::jsonb) where id = 'l1'`, [
    decided(U.mgr),
  ])),
)
check(
  'employees can cancel approved future leave',
  !(await denied(U.emp, `update public.leave_requests set data = data || '{"status":"cancelled"}' where id = 'l1'`)),
)
check('colleagues cannot see the leave', (await rows(U.oth, 'select * from public.leave_requests')).length === 0)

// ---- onboarding checklists
const task = (id, assignee, status = 'open') => ({
  id,
  title: id,
  owner: 'manager',
  assigneeId: assignee,
  dueDate: '2099-01-01',
  status,
  requiresDocument: false,
  externalAction: false,
  documentId: null,
  completedAt: null,
  completedBy: null,
  note: '',
})
await ins('lifecycle_cases', 'c1', {
  kind: 'onboarding',
  employeeId: 'e_emp',
  keyDate: '2099-01-01',
  status: 'active',
  tasks: [task('t1', U.mgr), task('t2', U.hr)],
  timeline: [],
})
const done = (t, by) => ({ ...t, status: 'done', completedAt: '2099-01-01', completedBy: by })
check(
  'assignees complete their own task',
  !(await denied(U.mgr, `update public.lifecycle_cases set data = jsonb_set(data, '{tasks}', $1::jsonb) where id = 'c1'`, [
    JSON.stringify([done(task('t1', U.mgr), U.mgr), task('t2', U.hr)]),
  ])),
)
check(
  'assignees cannot complete someone else’s task',
  await denied(U.mgr, `update public.lifecycle_cases set data = jsonb_set(data, '{tasks}', $1::jsonb) where id = 'c1'`, [
    JSON.stringify([done(task('t1', U.mgr), U.mgr), done(task('t2', U.hr), U.mgr)]),
  ]),
)
check('assignees cannot move the key date', await denied(U.mgr, `update public.lifecycle_cases set data = data || '{"keyDate":"2000-01-01"}' where id = 'c1'`))

// ---- policies, acknowledgments, notifications, audit, memberships
await ins('policies', 'p1', { title: 'Draft', status: 'draft', audienceDepartmentIds: null })
await ins('policies', 'p2', { title: 'Finance only', status: 'published', audienceDepartmentIds: ['d2'] })
await ins('policies', 'p3', { title: 'Everyone', status: 'published', audienceDepartmentIds: null })
check(
  'employees see only published policies in their audience',
  (await rows(U.emp, 'select id from public.policies order by id')).map((r) => r.id).join() === 'p3',
)
check('HR sees published policies for every audience', (await rows(U.hr, `select id from public.policies where status = 'published'`)).length === 2)
check(
  'employees acknowledge only for themselves',
  await denied(U.emp, `insert into public.policy_acknowledgments (org_id, id, data) values ($1, 'a1', '{"employeeId":"e_oth","policyId":"p3"}')`, [org]),
)
await as(U.hr, () => q(`insert into public.notifications (org_id, id, data) values ($1, 'nt1', $2)`, [org, { accountId: U.emp, title: 'Hi' }]))
check(
  'notifications are visible to their recipient only',
  (await rows(U.emp, 'select * from public.notifications')).length === 1 && (await rows(U.oth, 'select * from public.notifications')).length === 0,
)
check(
  'audit entries cannot be attributed to someone else',
  await denied(U.emp, `insert into public.audit_events (org_id, id, data) values ($1, 'au1', $2)`, [org, { actorId: U.hr, summary: 'x' }]),
)
check('employees cannot read the audit log', (await rows(U.emp, 'select * from public.audit_events')).length === 0)
check('employees cannot change roles', await denied(U.emp, `update public.memberships set role = 'org_admin' where user_id = $1`, [U.emp]))
check('admins cannot change their own role', await denied(U.admin, `update public.memberships set role = 'employee' where user_id = $1`, [U.admin]))
check(
  'assistant conversations are private',
  await denied(U.oth, `insert into public.assistant_conversations (org_id, id, data) values ($1, 'cv1', $2)`, [org, { accountId: U.emp, messages: [] }]),
)

// ---- storage
for (const name of [`${org}/employees/e_emp/f-contract.pdf`, `${org}/employees/e_oth/f-contract.pdf`])
  await q(`insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)`, [name, U.hr])
check('employees read files in their own folder only', (await rows(U.emp, 'select name from storage.objects')).length === 1)
check('managers read their reports’ files', (await rows(U.mgr, `select name from storage.objects where name like '%e_emp%'`)).length === 1)
check(
  'outsiders cannot upload into another organization',
  await denied(U.out, `insert into storage.objects (bucket_id, name) values ('documents', $1)`, [`${org}/requests/x.pdf`]),
)
check('other organizations stay isolated', other !== org && (await rows(U.out, 'select * from public.hr_requests')).length === 0)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exitCode = failures ? 1 : 0
