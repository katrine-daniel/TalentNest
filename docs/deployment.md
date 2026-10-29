# Deployment

## Static site (GitHub Pages) — what the live demo uses

`.github/workflows/deploy.yml` runs on every push to `main`:

1. `npm ci`, then lint, type-check and unit tests — a failing check stops the deploy.
2. `npm run build` with `VITE_BASE_PATH=/<repository>/` so assets and routes work under `https://<user>.github.io/<repository>/`.
3. Copies `dist/index.html` to `dist/404.html` so deep links (e.g. `/TalentNest/people`) load the app.
4. Publishes `dist/` with `actions/deploy-pages`.

Repository settings: **Settings → Pages → Source: GitHub Actions**.

Without Supabase variables the build is the **demo workspace**. To build against Supabase, add repository **variables** (not secrets — these values are public by design): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and optionally `VITE_ASSISTANT_URL`. Never add service-role or AI provider keys to the frontend build.

Any static host works the same way: build with the right `VITE_BASE_PATH` and serve `index.html` for unknown paths.

## Supabase backend

> Status: the schema and policies are verified on Postgres with `npm run test:db`. A live Supabase project (Auth, PostgREST, Storage, Edge Functions) has **not** been exercised end to end. Verify each step below on your project before relying on it.

### 1. Create the project and apply the schema

```bash
npm i -g supabase          # or use npx supabase
supabase link --project-ref <your-project-ref>
supabase db push           # applies supabase/migrations
```

Or paste `supabase/migrations/*.sql` into the SQL editor in order. The migration creates all tables, row-level-security policies, rule triggers and the private `documents` storage bucket.

### 2. Authentication

In **Authentication → Providers**, enable Email. Set **Site URL** to your deployed URL and add `<url>/reset-password` to the redirect URLs (used by password reset). Disable public sign-ups if only invited people should join — PeopleOS has no self-sign-up screen.

### 3. Create the first organization and administrator

Create the first user in **Authentication → Users → Add user**, then in the SQL editor:

```sql
insert into public.organizations (name, industry, timezone, country)
values ('Your company', 'Your industry', 'Europe/London', 'GB')
returning id;

insert into public.memberships (org_id, user_id, role)
values ('<organization id from above>', '<the user''s id>', 'org_admin');
```

That person signs in, configures **Organization** (departments, locations, schedules, holidays, leave types, request types, templates) and adds employees in **People**. A new organization starts empty — nothing is assumed about your country or industry.

### 4. Edge Functions

```bash
supabase secrets set ANTHROPIC_API_KEY=... ALLOWED_ORIGIN=https://<your-site> SITE_URL=https://<your-site>
supabase functions deploy assistant
supabase functions deploy invite-member
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions by Supabase automatically.

- **assistant** answers policy questions with Claude (`AI_MODEL`, default `claude-opus-5-5`) using only published policies the caller can read under RLS. Set `VITE_ASSISTANT_URL=https://<project-ref>.supabase.co/functions/v1/assistant` in the frontend build.
- **invite-member** lets organization administrators invite people from **Organization → Users & roles** and link them to an employee record.

### 5. Scheduled work

There is no server-side scheduler in this release. Scheduled checks (joins, leavers, overdue escalation, expiring documents, automation retries) run every 10 minutes in the browser of any signed-in HR user. If you need them to run unattended, add a scheduled job that performs the same checks with the service role — not included.

## Verifying a deployment

- Open the site, sign in, and check the browser console for errors.
- Visit a deep link directly (e.g. `/<repo>/policies`) — it should load, not 404.
- With Supabase: sign in as users of different roles and confirm an employee cannot open another person's request URL or see restricted fields.
