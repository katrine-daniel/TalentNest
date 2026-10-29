-- PeopleOS schema, row-level security and business-rule guards.
--
-- Every collection is stored as (org_id, id, data jsonb). Columns that policies need are generated
-- from `data`. Sensitive parts of records live in separate tables with stricter policies:
--   employee_private        personal email, phone, date of birth, emergency contact
--   employee_records        documents, equipment, change history
--   request_internal_notes  HR-only notes on service requests
-- Browsers use the anon key + the user's JWT. RLS limits rows to the user's organization and role;
-- triggers enforce rules that span fields (approvals, status transitions, task ownership).
-- The role → permission matrix mirrors src/domain/permissions.ts.

-- ============================================================== identity & tenancy
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  industry text not null default '',
  timezone text not null default 'UTC',
  country text not null default '',
  week_starts_on smallint not null default 1 check (week_starts_on in (0, 1)),
  terminology jsonb,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null
);

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('employee', 'manager', 'hr_specialist', 'hr_admin', 'org_admin')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  -- The employee record of this person, if any.
  employee_id text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);
create unique index memberships_employee_idx on public.memberships (org_id, employee_id) where employee_id is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ============================================================== authorization helpers
-- SECURITY DEFINER so policies can call them without recursive RLS evaluation.
create or replace function public.my_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.my_role(p_org) is not null
$$;

create or replace function public.my_employee(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.employee_id from public.memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
$$;

-- Mirrors ROLE_PERMISSIONS in src/domain/permissions.ts.
create or replace function public.has_permission(p_org uuid, p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case public.my_role(p_org)
    when 'org_admin' then true
    when 'hr_admin' then p in ('people.view_all', 'people.view_sensitive', 'people.manage', 'requests.handle', 'requests.view_all', 'leave.manage', 'lifecycle.manage', 'analytics.view', 'policies.manage', 'automation.manage', 'org.manage', 'audit.view')
    when 'hr_specialist' then p in ('people.view_all', 'people.view_sensitive', 'people.manage', 'requests.handle', 'requests.view_all', 'leave.manage', 'lifecycle.manage', 'analytics.view')
    when 'manager' then p in ('analytics.view')
    else false
  end
$$;

-- Caller is (or has been delegated) an approver on any step of an approval chain.
create or replace function public.is_approver(steps jsonb) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(steps, '[]'::jsonb)) s
    where (s -> 'approverIds') ? (auth.uid())::text or s ->> 'delegatedTo' = (auth.uid())::text
  )
$$;

create or replace function public.create_organization(org_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_org uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  insert into public.organizations (name) values (trim(org_name)) returning id into new_org;
  insert into public.memberships (org_id, user_id, role) values (new_org, auth.uid(), 'org_admin');
  return new_org;
end;
$$;
revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

create view public.org_members with (security_invoker = true) as
  select m.org_id, m.user_id, m.employee_id, m.role, m.status, p.full_name, p.email
  from public.memberships m join public.profiles p on p.id = m.user_id;

-- ============================================================== data tables
do $$
declare t text;
begin
  foreach t in array array[
    'departments', 'teams', 'locations', 'employment_types', 'work_schedules', 'holidays', 'request_types', 'leave_types',
    'announcements', 'lifecycle_templates', 'workflow_rules', 'workflow_runs', 'employees', 'employee_private', 'employee_records',
    'hr_requests', 'request_internal_notes', 'leave_requests', 'leave_adjustments', 'lifecycle_cases', 'tasks', 'policies',
    'policy_acknowledgments', 'notifications', 'notification_preferences', 'inbox_state', 'audit_events', 'assistant_conversations']
  loop
    execute format($f$
      create table public.%1$I (
        org_id uuid not null references public.organizations (id) on delete cascade,
        id text not null check (char_length(id) between 1 and 200),
        data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (org_id, id)
      )$f$, t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Columns derived from `data` for policies and indexes.
alter table public.employees add column manager_id text generated always as (data ->> 'managerId') stored,
  add column department_id text generated always as (data ->> 'departmentId') stored;
alter table public.hr_requests add column requester_id text generated always as (data ->> 'requesterId') stored,
  add column employee_id text generated always as (data ->> 'employeeId') stored,
  add column assignee_id text generated always as (data ->> 'assigneeId') stored;
alter table public.request_internal_notes add column request_id text generated always as (data ->> 'requestId') stored;
alter table public.leave_requests add column employee_id text generated always as (data ->> 'employeeId') stored,
  add column requested_by text generated always as (data ->> 'requestedBy') stored;
alter table public.leave_adjustments add column employee_id text generated always as (data ->> 'employeeId') stored;
alter table public.lifecycle_cases add column employee_id text generated always as (data ->> 'employeeId') stored;
alter table public.tasks add column assignee_id text generated always as (data ->> 'assigneeId') stored,
  add column created_by text generated always as (data ->> 'createdBy') stored;
alter table public.policies add column status text generated always as (data ->> 'status') stored;
alter table public.policy_acknowledgments add column employee_id text generated always as (data ->> 'employeeId') stored;
alter table public.audit_events add column actor_id text generated always as (data ->> 'actorId') stored;
do $$
declare t text;
begin
  foreach t in array array['notifications', 'notification_preferences', 'inbox_state', 'assistant_conversations']
  loop
    execute format('alter table public.%I add column account_id text generated always as (data ->> ''accountId'') stored', t);
    execute format('create index %1$s_account_idx on public.%1$I (org_id, account_id)', t);
  end loop;
end;
$$;
create index employees_manager_idx on public.employees (org_id, manager_id);
create index hr_requests_employee_idx on public.hr_requests (org_id, employee_id);
create index leave_requests_employee_idx on public.leave_requests (org_id, employee_id);
create index tasks_assignee_idx on public.tasks (org_id, assignee_id);
create unique index tasks_source_key_idx on public.tasks (org_id, (data ->> 'sourceKey')) where data ->> 'sourceKey' is not null;
create unique index employees_work_email_idx on public.employees (org_id, lower(data ->> 'workEmail'));

-- True when `p_employee` reports (directly or indirectly) to the caller's employee record.
create or replace function public.in_my_reporting_line(p_org uuid, p_employee text) returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive chain(id, depth) as (
    select e.data ->> 'managerId', 1 from public.employees e where e.org_id = p_org and e.id = p_employee
    union all
    select e.data ->> 'managerId', c.depth + 1 from chain c join public.employees e on e.org_id = p_org and e.id = c.id where c.depth < 50
  )
  select public.my_employee(p_org) is not null and exists (select 1 from chain where id = public.my_employee(p_org))
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

-- ============================================================== row-level security
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;

create policy "members read their organization" on public.organizations for select using (public.is_member(id));
create policy "org admins update the organization" on public.organizations for update using (public.has_permission(id, 'org.manage')) with check (public.has_permission(id, 'org.manage'));
create policy "read own and co-member profiles" on public.profiles for select using (
  id = auth.uid() or exists (select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id where a.user_id = auth.uid() and a.status = 'active' and b.user_id = profiles.id));
create policy "update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "members read memberships" on public.memberships for select using (user_id = auth.uid() or public.is_member(org_id));
-- Admins change roles of others; nobody changes their own role or status. New members join via create_organization or the invite function.
create policy "admins manage other members" on public.memberships for update
  using (public.has_permission(org_id, 'accounts.manage') and user_id <> auth.uid())
  with check (public.has_permission(org_id, 'accounts.manage') and user_id <> auth.uid());

-- Organization configuration: read by members, written with org.manage (templates: lifecycle.manage, rules: automation.manage).
do $$
declare t text; perm text;
begin
  foreach t in array array['departments', 'teams', 'locations', 'employment_types', 'work_schedules', 'holidays', 'request_types', 'leave_types', 'announcements', 'lifecycle_templates', 'workflow_rules']
  loop
    perm := case t when 'lifecycle_templates' then 'lifecycle.manage' when 'workflow_rules' then 'automation.manage' else 'org.manage' end;
    execute format('create policy "members read" on public.%I for select using (public.is_member(org_id))', t);
    execute format('create policy "managers write" on public.%I for all using (public.has_permission(org_id, %L)) with check (public.has_permission(org_id, %L))', t, perm, perm);
  end loop;
end;
$$;

-- Directory: everyone in the organization reads work profiles; HR writes them.
create policy "members read directory" on public.employees for select using (public.is_member(org_id));
create policy "hr writes employees" on public.employees for all using (public.has_permission(org_id, 'people.manage')) with check (public.has_permission(org_id, 'people.manage'));

-- Personal data: the employee and roles with people.view_sensitive.
create policy "self and hr read personal data" on public.employee_private for select using (public.has_permission(org_id, 'people.view_sensitive') or id = public.my_employee(org_id));
create policy "hr writes personal data" on public.employee_private for all using (public.has_permission(org_id, 'people.manage')) with check (public.has_permission(org_id, 'people.manage'));

-- Employment records: HR, the employee, and managers in their reporting line.
create policy "read employment records" on public.employee_records for select using (
  public.has_permission(org_id, 'people.view_all') or id = public.my_employee(org_id) or public.in_my_reporting_line(org_id, id));
create policy "hr inserts employment records" on public.employee_records for insert with check (public.has_permission(org_id, 'people.manage') or public.has_permission(org_id, 'lifecycle.manage'));
-- Employees may add documents to their own record (guarded by trigger below).
create policy "update employment records" on public.employee_records for update
  using (public.has_permission(org_id, 'people.manage') or public.has_permission(org_id, 'lifecycle.manage') or id = public.my_employee(org_id))
  with check (public.has_permission(org_id, 'people.manage') or public.has_permission(org_id, 'lifecycle.manage') or id = public.my_employee(org_id));

-- Service requests.
create policy "read requests" on public.hr_requests for select using (
  public.has_permission(org_id, 'requests.view_all') or requester_id = (auth.uid())::text or employee_id = public.my_employee(org_id)
  or public.is_approver(data -> 'approvals') or (public.my_role(org_id) = 'manager' and public.in_my_reporting_line(org_id, employee_id)));
create policy "raise requests" on public.hr_requests for insert with check (
  public.is_member(org_id) and (public.has_permission(org_id, 'requests.handle') or (requester_id = (auth.uid())::text and employee_id = public.my_employee(org_id))));
create policy "update requests" on public.hr_requests for update
  using (public.has_permission(org_id, 'requests.handle') or requester_id = (auth.uid())::text or public.is_approver(data -> 'approvals'))
  with check (public.is_member(org_id));
create policy "hr reads and writes internal notes" on public.request_internal_notes for all using (public.has_permission(org_id, 'requests.handle')) with check (public.has_permission(org_id, 'requests.handle'));

-- Leave.
create policy "read leave" on public.leave_requests for select using (
  public.has_permission(org_id, 'leave.manage') or employee_id = public.my_employee(org_id) or requested_by = (auth.uid())::text
  or public.is_approver(data -> 'approvals') or public.in_my_reporting_line(org_id, employee_id));
create policy "request leave" on public.leave_requests for insert with check (
  public.has_permission(org_id, 'leave.manage') or (employee_id = public.my_employee(org_id) and requested_by = (auth.uid())::text));
create policy "update leave" on public.leave_requests for update
  using (public.has_permission(org_id, 'leave.manage') or employee_id = public.my_employee(org_id) or public.is_approver(data -> 'approvals'))
  with check (public.is_member(org_id));
create policy "read adjustments" on public.leave_adjustments for select using (
  public.has_permission(org_id, 'leave.manage') or employee_id = public.my_employee(org_id) or public.in_my_reporting_line(org_id, employee_id));
create policy "hr writes adjustments" on public.leave_adjustments for all using (public.has_permission(org_id, 'leave.manage')) with check (public.has_permission(org_id, 'leave.manage'));

-- Onboarding / offboarding.
create policy "read checklists" on public.lifecycle_cases for select using (
  public.has_permission(org_id, 'lifecycle.manage') or employee_id = public.my_employee(org_id) or public.in_my_reporting_line(org_id, employee_id)
  or exists (select 1 from jsonb_array_elements(data -> 'tasks') t where t ->> 'assigneeId' = (auth.uid())::text));
create policy "hr creates checklists" on public.lifecycle_cases for insert with check (public.has_permission(org_id, 'lifecycle.manage'));
create policy "update checklists" on public.lifecycle_cases for update
  using (public.has_permission(org_id, 'lifecycle.manage') or exists (select 1 from jsonb_array_elements(data -> 'tasks') t where t ->> 'assigneeId' = (auth.uid())::text))
  with check (public.is_member(org_id));
create policy "hr deletes checklists" on public.lifecycle_cases for delete using (public.has_permission(org_id, 'lifecycle.manage'));

-- Tasks (automation creates them in the acting user's session).
create policy "read tasks" on public.tasks for select using (public.has_permission(org_id, 'requests.handle') or assignee_id = (auth.uid())::text or created_by = (auth.uid())::text);
create policy "members create tasks" on public.tasks for insert with check (public.is_member(org_id));
create policy "owners update tasks" on public.tasks for update
  using (public.has_permission(org_id, 'requests.handle') or assignee_id = (auth.uid())::text or created_by = (auth.uid())::text)
  with check (public.is_member(org_id));

-- Policies: published versions for the audience; drafts for policy managers.
create policy "read policies" on public.policies for select using (
  public.has_permission(org_id, 'policies.manage')
  or (public.is_member(org_id) and status = 'published' and (
    jsonb_typeof(data -> 'audienceDepartmentIds') is distinct from 'array'
    or public.has_permission(org_id, 'people.view_all')
    or (data -> 'audienceDepartmentIds') ? (select e.department_id from public.employees e where e.org_id = policies.org_id and e.id = public.my_employee(policies.org_id)))));
create policy "policy managers write" on public.policies for all using (public.has_permission(org_id, 'policies.manage')) with check (public.has_permission(org_id, 'policies.manage'));
create policy "read acknowledgments" on public.policy_acknowledgments for select using (
  public.has_permission(org_id, 'policies.manage') or public.has_permission(org_id, 'people.view_all') or employee_id = public.my_employee(org_id));
create policy "acknowledge for yourself" on public.policy_acknowledgments for insert with check (employee_id = public.my_employee(org_id));

-- Notifications: anyone in the organization may notify; only the recipient reads and marks them.
create policy "recipient reads" on public.notifications for select using (public.is_member(org_id) and account_id = (auth.uid())::text);
create policy "members notify" on public.notifications for insert with check (public.is_member(org_id));
create policy "recipient updates" on public.notifications for update using (account_id = (auth.uid())::text) with check (account_id = (auth.uid())::text);
do $$
declare t text;
begin
  foreach t in array array['notification_preferences', 'inbox_state', 'assistant_conversations']
  loop
    execute format('create policy "own rows only" on public.%I for all using (public.is_member(org_id) and account_id = (auth.uid())::text) with check (public.is_member(org_id) and account_id = (auth.uid())::text)', t);
  end loop;
end;
$$;

-- Automation history: read and written by members (runs record what each session executed).
create policy "members read runs" on public.workflow_runs for select using (public.is_member(org_id));
create policy "members record runs" on public.workflow_runs for insert with check (public.is_member(org_id));
create policy "members update runs" on public.workflow_runs for update using (public.is_member(org_id)) with check (public.is_member(org_id));

-- Audit: append-only; attributed to the caller (or the system scheduler); read with audit.view.
create policy "auditors read" on public.audit_events for select using (public.has_permission(org_id, 'audit.view'));
create policy "members append" on public.audit_events for insert with check (public.is_member(org_id) and (actor_id is null or actor_id = (auth.uid())::text));

-- ============================================================== business-rule guards
-- Validates changes to an approval chain made by a non-HR user: newly decided steps must be decided
-- by the caller, who must be an approver of that step and neither the requester nor its subject.
create or replace function public.check_approval_change(old_steps jsonb, new_steps jsonb, requester text, subject text, p_org uuid) returns void
language plpgsql stable set search_path = '' as $$
declare
  i int;
  o jsonb;
  n jsonb;
  me text := (auth.uid())::text;
begin
  if jsonb_array_length(coalesce(old_steps, '[]')) <> jsonb_array_length(coalesce(new_steps, '[]')) then
    raise exception 'The approval chain cannot be changed' using errcode = '42501';
  end if;
  for i in 0 .. jsonb_array_length(coalesce(new_steps, '[]')) - 1 loop
    o := old_steps -> i;
    n := new_steps -> i;
    if o = n then continue; end if;
    if (o ->> 'decision') <> 'pending' then raise exception 'A decided approval step cannot be changed' using errcode = '42501'; end if;
    if (o - 'decision' - 'decidedBy' - 'decidedAt' - 'comment' - 'delegatedTo') <> (n - 'decision' - 'decidedBy' - 'decidedAt' - 'comment' - 'delegatedTo') then
      raise exception 'Approvers cannot be changed' using errcode = '42501';
    end if;
    if not ((o -> 'approverIds') ? me or o ->> 'delegatedTo' = me) then raise exception 'You are not an approver for this step' using errcode = '42501'; end if;
    if me = requester or public.my_employee(p_org) = subject then raise exception 'You cannot approve your own request' using errcode = '42501'; end if;
    if (n ->> 'decision') <> 'pending' and n ->> 'decidedBy' is distinct from me then raise exception 'Decisions are recorded under your own name' using errcode = '42501'; end if;
  end loop;
end;
$$;

create or replace function public.guard_hr_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me text := (auth.uid())::text;
  os text;
  ns text := new.data ->> 'status';
begin
  if public.has_permission(new.org_id, 'requests.handle') then return new; end if;
  if tg_op = 'INSERT' then
    if ns not in ('open', 'pending_approval') or new.data ->> 'assigneeId' is not null
       or exists (select 1 from jsonb_array_elements(coalesce(new.data -> 'approvals', '[]')) s where s ->> 'decision' <> 'pending') then
      raise exception 'New requests start open or pending approval' using errcode = '42501';
    end if;
    return new;
  end if;
  os := old.data ->> 'status';
  if (old.data - 'status' - 'approvals' - 'comments' - 'timeline' - 'updatedAt' - 'description' - 'proposedChanges' - 'resolution' - 'resolvedAt')
     <> (new.data - 'status' - 'approvals' - 'comments' - 'timeline' - 'updatedAt' - 'description' - 'proposedChanges' - 'resolution' - 'resolvedAt') then
    raise exception 'Only HR can change the owner, priority, type or due date of a request' using errcode = '42501';
  end if;
  if me = old.data ->> 'requesterId' and os = 'changes_requested' and ns = 'pending_approval' then
    -- Resubmission: the chain restarts with every step pending.
    if exists (select 1 from jsonb_array_elements(coalesce(new.data -> 'approvals', '[]')) s where s ->> 'decision' <> 'pending') then
      raise exception 'A resubmitted request restarts its approvals' using errcode = '42501';
    end if;
    return new;
  end if;
  if (old.data ->> 'description') is distinct from (new.data ->> 'description') or (old.data -> 'proposedChanges') is distinct from (new.data -> 'proposedChanges') then
    raise exception 'The request can only be edited when it is resubmitted' using errcode = '42501';
  end if;
  perform public.check_approval_change(old.data -> 'approvals', new.data -> 'approvals', old.data ->> 'requesterId', old.data ->> 'employeeId', new.org_id);
  if os is distinct from ns then
    if me = old.data ->> 'requesterId' and (ns in ('cancelled', 'closed') or (os in ('resolved', 'waiting_on_employee') and ns = 'in_progress')) then
      return new;
    end if;
    if os = 'pending_approval' and ns in ('pending_approval', 'approved', 'rejected', 'changes_requested', 'resolved') and public.is_approver(old.data -> 'approvals') then
      return new;
    end if;
    raise exception 'You cannot move this request from % to %', os, ns using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_hr_request before insert or update on public.hr_requests for each row execute function public.guard_hr_request();

create or replace function public.guard_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me text := (auth.uid())::text;
  own boolean;
  os text;
  ns text := new.data ->> 'status';
begin
  if public.has_permission(new.org_id, 'leave.manage') then return new; end if;
  if tg_op = 'INSERT' then
    if ns = 'approved' then
      -- Only leave types configured without an approval chain are recorded directly.
      if exists (select 1 from public.leave_types t where t.org_id = new.org_id and t.id = new.data ->> 'leaveTypeId' and jsonb_array_length(coalesce(t.data -> 'approvalChain', '[]')) > 0) then
        raise exception 'This leave type requires approval' using errcode = '42501';
      end if;
    elsif ns <> 'pending' then
      raise exception 'New leave requests start pending' using errcode = '42501';
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(new.data -> 'approvals', '[]')) s where s ->> 'decision' <> 'pending') then
      raise exception 'Approvals cannot be pre-filled' using errcode = '42501';
    end if;
    return new;
  end if;
  os := old.data ->> 'status';
  own := old.data ->> 'employeeId' = public.my_employee(new.org_id) or old.data ->> 'requestedBy' = me;
  if (old.data ->> 'employeeId') is distinct from (new.data ->> 'employeeId') or (old.data ->> 'requestedBy') is distinct from (new.data ->> 'requestedBy') then
    raise exception 'The employee of a leave request cannot change' using errcode = '42501';
  end if;
  if own and os = 'changes_requested' and ns = 'pending' then
    if exists (select 1 from jsonb_array_elements(coalesce(new.data -> 'approvals', '[]')) s where s ->> 'decision' <> 'pending') then
      raise exception 'A resubmitted request restarts its approvals' using errcode = '42501';
    end if;
    return new;
  end if;
  if (old.data - 'status' - 'approvals' - 'timeline' - 'updatedAt') <> (new.data - 'status' - 'approvals' - 'timeline' - 'updatedAt') then
    raise exception 'Leave details can only change when the request is resubmitted' using errcode = '42501';
  end if;
  perform public.check_approval_change(old.data -> 'approvals', new.data -> 'approvals', old.data ->> 'requestedBy', old.data ->> 'employeeId', new.org_id);
  if os is distinct from ns then
    if own and ns = 'cancelled' and (os in ('pending', 'changes_requested') or (os = 'approved' and (old.data ->> 'startDate') > to_char(current_date, 'YYYY-MM-DD'))) then
      return new;
    end if;
    if os = 'pending' and ns in ('pending', 'approved', 'rejected', 'changes_requested') and public.is_approver(old.data -> 'approvals') and not own then
      return new;
    end if;
    raise exception 'You cannot move this leave request from % to %', os, ns using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_leave before insert or update on public.leave_requests for each row execute function public.guard_leave();

-- Task assignees (not HR) may only complete or annotate their own checklist tasks.
create or replace function public.guard_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me text := (auth.uid())::text;
  i int;
  o jsonb;
  n jsonb;
begin
  if public.has_permission(new.org_id, 'lifecycle.manage') then return new; end if;
  if (old.data - 'tasks' - 'timeline' - 'status' - 'completedAt') <> (new.data - 'tasks' - 'timeline' - 'status' - 'completedAt') then
    raise exception 'Only HR can change a checklist' using errcode = '42501';
  end if;
  if jsonb_array_length(old.data -> 'tasks') <> jsonb_array_length(new.data -> 'tasks') then
    raise exception 'Only HR can add or remove checklist tasks' using errcode = '42501';
  end if;
  for i in 0 .. jsonb_array_length(new.data -> 'tasks') - 1 loop
    o := old.data -> 'tasks' -> i;
    n := new.data -> 'tasks' -> i;
    if o = n then continue; end if;
    if o ->> 'assigneeId' is distinct from me
       or (o - 'status' - 'completedAt' - 'completedBy' - 'note' - 'documentId') <> (n - 'status' - 'completedAt' - 'completedBy' - 'note' - 'documentId')
       or (n ->> 'status' <> 'open' and n ->> 'completedBy' is distinct from me) then
      raise exception 'You can only complete tasks assigned to you' using errcode = '42501';
    end if;
  end loop;
  if (old.data ->> 'status') is distinct from (new.data ->> 'status') and not (
       new.data ->> 'status' = 'completed' and not exists (select 1 from jsonb_array_elements(new.data -> 'tasks') t where t ->> 'status' = 'open')) then
    raise exception 'Only HR can change the checklist status' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_lifecycle before update on public.lifecycle_cases for each row execute function public.guard_lifecycle();

-- Employees may only add documents to their own record.
create or replace function public.guard_employee_records() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.has_permission(new.org_id, 'people.manage') or public.has_permission(new.org_id, 'lifecycle.manage') then return new; end if;
  if (old.data - 'documents') <> (new.data - 'documents')
     or exists (select 1 from jsonb_array_elements(coalesce(old.data -> 'documents', '[]')) d where not (coalesce(new.data -> 'documents', '[]') @> jsonb_build_array(d))) then
    raise exception 'You can only add documents to your own record' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_employee_records before update on public.employee_records for each row execute function public.guard_employee_records();

do $$
declare t text;
begin
  for t in select table_name from information_schema.columns where table_schema = 'public' and column_name = 'updated_at' and table_name <> 'organizations'
  loop
    execute format('create trigger touch_%1$s before update on public.%1$I for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;

-- ============================================================== storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array[
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'text/csv'])
on conflict (id) do nothing;

-- Object names: "<org_id>/employees/<employee_id>/<file>" or "<org_id>/requests/<file>".
create policy "read documents" on storage.objects for select to authenticated using (
  bucket_id = 'documents' and public.is_member(((storage.foldername(name))[1])::uuid) and (
    owner = auth.uid()
    or ((storage.foldername(name))[2] = 'requests' and public.has_permission(((storage.foldername(name))[1])::uuid, 'requests.handle'))
    or ((storage.foldername(name))[2] = 'employees' and (
      public.has_permission(((storage.foldername(name))[1])::uuid, 'people.view_all')
      or (storage.foldername(name))[3] = public.my_employee(((storage.foldername(name))[1])::uuid)
      or public.in_my_reporting_line(((storage.foldername(name))[1])::uuid, (storage.foldername(name))[3])))));
create policy "upload documents" on storage.objects for insert to authenticated with check (
  bucket_id = 'documents' and public.is_member(((storage.foldername(name))[1])::uuid) and (
    (storage.foldername(name))[2] = 'requests'
    or ((storage.foldername(name))[2] = 'employees' and (
      public.has_permission(((storage.foldername(name))[1])::uuid, 'people.manage')
      or public.has_permission(((storage.foldername(name))[1])::uuid, 'lifecycle.manage')
      or (storage.foldername(name))[3] = public.my_employee(((storage.foldername(name))[1])::uuid)))));
create policy "hr deletes documents" on storage.objects for delete to authenticated using (
  bucket_id = 'documents' and public.has_permission(((storage.foldername(name))[1])::uuid, 'people.manage'));
