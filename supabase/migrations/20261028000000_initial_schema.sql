-- TalentNest initial schema
--
-- Multi-tenant model: every business row carries org_id and is protected by Row Level
-- Security. Browser clients use the anon key + the user's JWT; they can only read and
-- write rows of organizations where they hold an active membership. Business rules that
-- must not depend on the browser (requisition approval, publishing, restricted notes,
-- scorecard ownership) are enforced here with policies and triggers.
--
-- Column names are the snake_case form of the app's camelCase fields
-- (src/types/domain.ts, src/services/storage/rowMapping.ts). Nested structures are jsonb.
-- Date fields whose format the app defines (e.g. start_date, due_date) are text so they
-- round-trip unchanged; system timestamps are timestamptz.

create extension if not exists pgcrypto;

-- ============================================================== tenancy & identity
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text not null,
  title text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('Admin', 'Recruiter', 'Hiring Manager', 'Interviewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'deactivated')),
  department_id text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.org_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  role_permissions jsonb not null default '{}'::jsonb,
  notification_prefs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Profile row for every new auth user (name from sign-up metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================== authorization helpers
-- SECURITY DEFINER so policies on memberships can call them without recursion.
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function public.org_role(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.memberships m
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active';
$$;

-- Admins hold every permission; other roles use the organization's permission matrix.
create or replace function public.has_org_permission(p_org uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.org_role(p_org) is null then false
    when public.org_role(p_org) = 'Admin' then true
    else coalesce(
      (select (s.role_permissions -> public.org_role(p_org)) ? p_permission
       from public.org_settings s where s.org_id = p_org),
      false)
  end;
$$;

-- Creates an organization owned by the caller and makes them its Admin.
create or replace function public.create_organization(org_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if char_length(trim(coalesce(org_name, ''))) < 2 then
    raise exception 'Organization name is too short' using errcode = '22023';
  end if;
  insert into public.organizations (name, created_by) values (trim(org_name), auth.uid()) returning id into new_org;
  insert into public.memberships (org_id, user_id, role, status) values (new_org, auth.uid(), 'Admin', 'active');
  return new_org;
end;
$$;
revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

-- Member directory used by the app's user list.
create view public.org_members
with (security_invoker = true) as
  select m.org_id, m.user_id, p.full_name, p.email, p.title, m.role, m.department_id, m.status
  from public.memberships m
  join public.profiles p on p.id = m.user_id;

-- ============================================================== recruiting data
create table public.departments (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null,
  code text,
  head_id text,
  color text,
  primary key (org_id, id)
);

create table public.workflow_templates (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null,
  description text default '',
  stages jsonb not null default '[]'::jsonb,
  primary key (org_id, id)
);

create table public.assessment_templates (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null,
  type text,
  duration_min integer,
  pass_mark numeric check (pass_mark between 0 and 100),
  question_count integer,
  workflow_template_ids jsonb not null default '[]'::jsonb,
  provider text,
  primary key (org_id, id)
);

create table public.scorecard_templates (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null,
  criteria jsonb not null default '[]'::jsonb,
  primary key (org_id, id)
);

create table public.onboarding_templates (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null,
  tasks jsonb not null default '[]'::jsonb,
  primary key (org_id, id)
);

create table public.requisitions (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  title text not null,
  department_id text not null,
  justification text not null default '',
  headcount integer not null check (headcount between 1 and 200),
  budget_min numeric not null check (budget_min >= 0),
  budget_max numeric not null,
  hiring_manager_id text,
  approver_id text,
  status text not null check (status in ('draft', 'pending', 'approved', 'rejected', 'revision-requested')),
  job_id text,
  created_by_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  history jsonb not null default '[]'::jsonb,
  primary key (org_id, id),
  check (budget_max >= budget_min)
);
create index requisitions_status_idx on public.requisitions (org_id, status);

create table public.jobs (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  title text not null,
  department_id text,
  category text,
  location text,
  work_mode text,
  employment_type text,
  workflow_template_id text,
  hiring_manager_id text,
  recruiter_id text,
  status text not null check (status in ('open', 'draft', 'on-hold', 'closed')),
  openings integer not null default 1 check (openings >= 1),
  experience_min integer,
  experience_max integer,
  salary_min numeric,
  salary_max numeric,
  skills jsonb not null default '[]'::jsonb,
  description text,
  stages jsonb not null default '[]'::jsonb,
  requisition_id text,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);
create index jobs_status_idx on public.jobs (org_id, status);
create unique index jobs_requisition_unique on public.jobs (org_id, requisition_id) where requisition_id is not null;

create table public.candidates (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  ref text not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  location text,
  current_title text,
  current_company text,
  experience_years numeric,
  notice_period text,
  expected_salary numeric,
  source text,
  recruiter_id text,
  skills jsonb not null default '[]'::jsonb,
  languages jsonb not null default '[]'::jsonb,
  experience jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  -- Team-visible notes only; restricted notes live in candidate_restricted_notes.
  notes jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  resume jsonb,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);
create unique index candidates_email_unique on public.candidates (org_id, lower(email));
create index candidates_recruiter_idx on public.candidates (org_id, recruiter_id);

create table public.candidate_restricted_notes (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  candidate_id text not null,
  note jsonb not null,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);
-- No FK to candidates: notes are split out in a BEFORE trigger, before the candidate row exists.
create index candidate_restricted_notes_candidate_idx on public.candidate_restricted_notes (org_id, candidate_id);

create table public.applications (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  candidate_id text not null,
  job_id text not null,
  stage_id text not null,
  status text not null check (status in ('active', 'hired', 'rejected', 'withdrawn')),
  rating numeric,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  history jsonb not null default '[]'::jsonb,
  primary key (org_id, id),
  foreign key (org_id, candidate_id) references public.candidates (org_id, id) on delete cascade,
  foreign key (org_id, job_id) references public.jobs (org_id, id) on delete cascade
);
create unique index applications_candidate_job_unique on public.applications (org_id, candidate_id, job_id);
create index applications_job_stage_idx on public.applications (org_id, job_id, stage_id);

create table public.interviews (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  application_id text not null,
  candidate_id text not null,
  job_id text not null,
  stage_id text,
  stage_name text,
  start timestamptz not null,
  duration_min integer not null check (duration_min between 5 and 600),
  interviewer_ids jsonb not null default '[]'::jsonb,
  mode text,
  location text,
  scorecard_id text,
  status text not null check (status in ('scheduled', 'completed', 'cancelled', 'no-show')),
  attendance text,
  reminder_sent_at timestamptz,
  cancel_reason text,
  notes text,
  created_by_id text,
  created_at timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, application_id) references public.applications (org_id, id) on delete cascade
);
create index interviews_start_idx on public.interviews (org_id, start);

create table public.interview_feedback (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  interview_id text not null,
  interviewer_id text not null,
  status text not null check (status in ('draft', 'submitted')),
  ratings jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  recommendation text check (recommendation in ('strong-yes', 'yes', 'no', 'strong-no')),
  strengths text default '',
  concerns text default '',
  summary text default '',
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  primary key (org_id, id),
  foreign key (org_id, interview_id) references public.interviews (org_id, id) on delete cascade
);
create unique index interview_feedback_one_per_panelist on public.interview_feedback (org_id, interview_id, interviewer_id);

create table public.assessments (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  application_id text not null,
  candidate_id text not null,
  job_id text not null,
  stage_id text,
  template_id text,
  assigned_at timestamptz not null default now(),
  deadline text,
  assigned_by_id text,
  status text not null check (status in ('pending', 'in-progress', 'submitted', 'evaluated', 'expired', 'cancelled')),
  score numeric check (score between 0 and 100),
  completed_at timestamptz,
  reminder_sent_at timestamptz,
  evaluator_id text,
  notes text default '',
  primary key (org_id, id),
  foreign key (org_id, application_id) references public.applications (org_id, id) on delete cascade
);

create table public.offers (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  application_id text not null,
  candidate_id text not null,
  job_id text not null,
  salary numeric not null check (salary > 0),
  joining_bonus numeric not null default 0,
  start_date text,
  expires_at text,
  status text not null check (status in ('draft', 'sent', 'negotiating', 'accepted', 'declined')),
  sent_at timestamptz,
  responded_at timestamptz,
  notes text default '',
  created_at timestamptz not null default now(),
  created_by_id text,
  primary key (org_id, id),
  foreign key (org_id, application_id) references public.applications (org_id, id) on delete cascade
);

create table public.onboarding_plans (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  offer_id text not null,
  candidate_id text not null,
  job_id text not null,
  start_date text,
  status text not null check (status in ('not-started', 'in-progress', 'blocked', 'completed')),
  tasks jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (org_id, id)
);
create unique index onboarding_plans_offer_unique on public.onboarding_plans (org_id, offer_id);

create table public.tasks (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  title text not null,
  assignee_id text,
  due_date text,
  status text not null check (status in ('open', 'done')),
  candidate_id text,
  application_id text,
  created_by_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  source_key text,
  primary key (org_id, id)
);
-- Automation idempotency: one task per rule/event key.
create unique index tasks_source_key_unique on public.tasks (org_id, source_key) where source_key is not null;
create index tasks_assignee_idx on public.tasks (org_id, assignee_id, status);

create table public.talent_pools (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null,
  description text default '',
  candidate_ids jsonb not null default '[]'::jsonb,
  created_by_id text,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);
create unique index talent_pools_name_unique on public.talent_pools (org_id, lower(name));

create table public.saved_searches (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null,
  query jsonb not null,
  created_by_id text,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.automation_rules (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null,
  description text default '',
  trigger text not null check (trigger in ('application.created', 'stage.changed', 'interview.completed', 'offer.accepted', 'feedback.overdue')),
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_by_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.automation_runs (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  rule_id text not null,
  rule_name text,
  trigger text not null,
  entity_id text,
  at timestamptz not null default now(),
  status text not null check (status in ('success', 'skipped', 'failed', 'dry-run')),
  detail text,
  actions jsonb not null default '[]'::jsonb,
  primary key (org_id, id)
);
create index automation_runs_at_idx on public.automation_runs (org_id, at desc);
create index automation_runs_detail_idx on public.automation_runs (org_id, detail);

create table public.activities (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  at timestamptz not null default now(),
  type text not null,
  actor_id text,
  candidate_id text,
  job_id text,
  text text not null,
  primary key (org_id, id)
);
create index activities_at_idx on public.activities (org_id, at desc);

create table public.notifications (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  type text,
  title text not null,
  body text default '',
  at timestamptz not null default now(),
  read boolean not null default false,
  link text,
  -- null = visible to everyone in the organization
  user_id text,
  primary key (org_id, id)
);
create index notifications_user_idx on public.notifications (org_id, user_id, at desc);

-- ============================================================== audit log
create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  table_name text not null,
  row_id text,
  action text not null,
  actor_id uuid default auth.uid(),
  at timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (org_id, at desc);

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (org_id, table_name, row_id, action)
  values ((rec ->> 'org_id')::uuid, tg_table_name, coalesce(rec ->> 'id', rec ->> 'user_id'), lower(tg_op));
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['candidates', 'candidate_restricted_notes', 'applications', 'offers', 'requisitions', 'jobs', 'interview_feedback', 'memberships', 'org_settings', 'automation_rules']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.write_audit_log()', t);
  end loop;
end;
$$;

-- ============================================================== server-side business rules
-- Requisition decisions need requisitions.approve; nobody approves their own request (Admins excepted).
create or replace function public.enforce_requisition_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and not public.has_org_permission(new.org_id, 'requisitions.create') then
    raise exception 'You do not have permission to raise requisitions' using errcode = '42501';
  end if;
  if new.status in ('approved', 'rejected', 'revision-requested')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if not public.has_org_permission(new.org_id, 'requisitions.approve') then
      raise exception 'You do not have permission to decide on requisitions' using errcode = '42501';
    end if;
    if new.created_by_id = auth.uid()::text and public.org_role(new.org_id) <> 'Admin' then
      raise exception 'You cannot approve your own requisition' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger requisitions_rules before insert or update on public.requisitions
  for each row execute function public.enforce_requisition_rules();

-- A vacancy can only be opened from an approved requisition.
create or replace function public.enforce_job_publishing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from 'open') then
    if not exists (
      select 1 from public.requisitions r
      where r.org_id = new.org_id and r.id = new.requisition_id and r.status = 'approved'
    ) then
      raise exception 'Link an approved requisition before publishing this vacancy' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger jobs_publishing before insert or update on public.jobs
  for each row execute function public.enforce_job_publishing();

-- Restricted notes are split out of candidates.notes into their own table so that RLS can
-- hide them from roles without candidates.notes.restricted.
create or replace function public.split_restricted_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n jsonb;
  kept text[];
begin
  if public.has_org_permission(new.org_id, 'candidates.notes.restricted') then
    -- Holders of the permission load every restricted note, so the incoming set is complete:
    -- anything missing from it was deleted in the app.
    select coalesce(array_agg(x ->> 'id'), '{}') into kept
    from jsonb_array_elements(coalesce(new.notes, '[]'::jsonb)) x
    where x ->> 'visibility' = 'restricted';
    if tg_op = 'UPDATE' then
      delete from public.candidate_restricted_notes r
      where r.org_id = new.org_id and r.candidate_id = new.id and not (r.id = any (kept));
    end if;
    for n in select * from jsonb_array_elements(coalesce(new.notes, '[]'::jsonb)) loop
      if n ->> 'visibility' = 'restricted' then
        insert into public.candidate_restricted_notes (org_id, id, candidate_id, note)
        values (new.org_id, n ->> 'id', new.id, n)
        on conflict (org_id, id) do update set note = excluded.note;
      end if;
    end loop;
  end if;
  new.notes := coalesce(
    (select jsonb_agg(x) from jsonb_array_elements(coalesce(new.notes, '[]'::jsonb)) x where coalesce(x ->> 'visibility', 'team') <> 'restricted'),
    '[]'::jsonb);
  return new;
end;
$$;
create trigger candidates_split_notes before insert or update on public.candidates
  for each row execute function public.split_restricted_notes();

create or replace function public.delete_restricted_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.candidate_restricted_notes r where r.org_id = old.org_id and r.candidate_id = old.id;
  return old;
end;
$$;
create trigger candidates_delete_notes after delete on public.candidates
  for each row execute function public.delete_restricted_notes();

-- Only the panelist can write their own scorecard, and only while on the interview panel.
create or replace function public.enforce_feedback_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.interviewer_id <> auth.uid()::text then
    raise exception 'Scorecards can only be written by the interviewer' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.interviews i
    where i.org_id = new.org_id and i.id = new.interview_id and i.interviewer_ids ? new.interviewer_id
  ) then
    raise exception 'You are not on this interview panel' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status = 'submitted' and new.status = 'draft' then
    raise exception 'A submitted scorecard cannot be returned to draft' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger interview_feedback_owner before insert or update on public.interview_feedback
  for each row execute function public.enforce_feedback_owner();

-- ============================================================== row level security
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.org_settings enable row level security;
alter table public.audit_log enable row level security;

create policy "members read their organizations" on public.organizations
  for select using (public.is_org_member(id));
create policy "admins rename organizations" on public.organizations
  for update using (public.org_role(id) = 'Admin') with check (public.org_role(id) = 'Admin');

create policy "read own and co-member profiles" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships mine
      join public.memberships theirs on theirs.org_id = mine.org_id
      where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = profiles.id
    )
  );
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "read own memberships and co-members" on public.memberships
  for select using (user_id = auth.uid() or public.is_org_member(org_id));
-- New members join through create_organization() or the invite-member Edge Function.
create policy "admins manage memberships" on public.memberships
  for update using (public.has_org_permission(org_id, 'settings.manage'))
  with check (public.has_org_permission(org_id, 'settings.manage') and not (user_id = auth.uid() and role <> 'Admin'));

create policy "members read settings" on public.org_settings
  for select using (public.is_org_member(org_id));
create policy "settings managers write settings" on public.org_settings
  for all using (public.has_org_permission(org_id, 'settings.manage'))
  with check (public.has_org_permission(org_id, 'settings.manage'));

create policy "admins read audit log" on public.audit_log
  for select using (public.org_role(org_id) = 'Admin');

-- Generic member access for most tables; finer rules follow.
do $$
declare t text;
begin
  foreach t in array array['departments', 'workflow_templates', 'assessment_templates', 'scorecard_templates', 'onboarding_templates',
                           'requisitions', 'jobs', 'candidates', 'candidate_restricted_notes', 'applications', 'interviews',
                           'interview_feedback', 'assessments', 'offers', 'onboarding_plans', 'tasks', 'talent_pools',
                           'saved_searches', 'automation_rules', 'automation_runs', 'activities', 'notifications']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Org configuration: readable by members, writable with settings.manage.
do $$
declare t text;
begin
  foreach t in array array['departments', 'workflow_templates', 'assessment_templates', 'scorecard_templates', 'onboarding_templates']
  loop
    execute format('create policy "members read" on public.%I for select using (public.is_org_member(org_id))', t);
    execute format('create policy "settings managers write" on public.%I for all using (public.has_org_permission(org_id, ''settings.manage'')) with check (public.has_org_permission(org_id, ''settings.manage''))', t);
  end loop;
end;
$$;

-- Day-to-day recruiting records: any active member may read and write; triggers above
-- enforce the rules that matter (approvals, publishing, scorecard ownership).
do $$
declare t text;
begin
  foreach t in array array['requisitions', 'jobs', 'candidates', 'applications', 'interviews', 'interview_feedback', 'assessments',
                           'offers', 'onboarding_plans', 'tasks', 'talent_pools', 'saved_searches']
  loop
    execute format('create policy "members read" on public.%I for select using (public.is_org_member(org_id))', t);
    execute format('create policy "members insert" on public.%I for insert with check (public.is_org_member(org_id))', t);
    execute format('create policy "members update" on public.%I for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))', t);
  end loop;
end;
$$;

-- Deletes are narrower than edits.
create policy "managers delete candidates" on public.candidates
  for delete using (public.has_org_permission(org_id, 'candidates.manage'));
create policy "managers delete jobs" on public.jobs
  for delete using (public.has_org_permission(org_id, 'jobs.manage'));
create policy "members delete own tasks or assigned" on public.tasks
  for delete using (public.is_org_member(org_id) and (created_by_id = auth.uid()::text or assignee_id = auth.uid()::text or public.org_role(org_id) = 'Admin'));
create policy "talent managers delete pools" on public.talent_pools
  for delete using (public.has_org_permission(org_id, 'talent.manage'));
create policy "owners delete saved searches" on public.saved_searches
  for delete using (public.is_org_member(org_id) and created_by_id = auth.uid()::text);
create policy "members delete applications with pipeline permission" on public.applications
  for delete using (public.has_org_permission(org_id, 'pipeline.move'));

-- Restricted notes: only roles holding candidates.notes.restricted.
create policy "restricted readers" on public.candidate_restricted_notes
  for select using (public.has_org_permission(org_id, 'candidates.notes.restricted'));
create policy "restricted writers delete" on public.candidate_restricted_notes
  for delete using (public.has_org_permission(org_id, 'candidates.notes.restricted'));

-- Automation: rules need automation.manage; runs are written by whichever member's browser
-- (or the scheduler function) executed the rule, and are append-only.
create policy "members read" on public.automation_rules for select using (public.is_org_member(org_id));
create policy "automation managers write" on public.automation_rules
  for all using (public.has_org_permission(org_id, 'automation.manage'))
  with check (public.has_org_permission(org_id, 'automation.manage'));
create policy "members read" on public.automation_runs for select using (public.is_org_member(org_id));
create policy "members append" on public.automation_runs for insert with check (public.is_org_member(org_id));

-- Activity feed is append-only.
create policy "members read" on public.activities for select using (public.is_org_member(org_id));
create policy "members append" on public.activities for insert with check (public.is_org_member(org_id));

-- Notifications: recipients (or everyone for broadcast) read; anyone in the org may notify;
-- only the recipient marks as read.
create policy "recipients read" on public.notifications
  for select using (public.is_org_member(org_id) and (user_id is null or user_id = auth.uid()::text));
create policy "members notify" on public.notifications
  for insert with check (public.is_org_member(org_id));
create policy "recipients update" on public.notifications
  for update using (public.is_org_member(org_id) and (user_id is null or user_id = auth.uid()::text))
  with check (public.is_org_member(org_id));

-- ============================================================== storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg']
)
on conflict (id) do nothing;

-- Object paths are "<org_id>/<folder>/<file>"; members can only touch their org's folder.
create policy "members read org documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "members upload org documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "managers delete org documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.has_org_permission(((storage.foldername(name))[1])::uuid, 'candidates.manage'));
