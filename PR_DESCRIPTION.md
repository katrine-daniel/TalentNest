# Replace TalentNest with PeopleOS — AI-powered HR operations platform

## What changed

This branch replaces the TalentNest recruitment app with **PeopleOS**, a new HR operations product. The old app stays in Git history (`main`, `feat/platform-upgrade`); nothing was force-pushed or rewritten.

**Core (domain and services, framework-free and unit-tested)**
- Employees: validation, duplicate detection, field-level change history, documents, equipment, departures, retention erasure, and CSV import with row-level errors.
- Service desk: request types with approval chains, explicit status transitions, internal notes hidden from employees, SLA due times in business hours, escalation, and record-update requests applied on approval.
- Leave: per-schedule and per-holiday day counting, pro-rated balances (entitlement, adjustments, taken, pending), overlap and balance checks (re-checked at approval), cancellation rules and delegation.
- Approvals: ordered chains (manager, department head, HR or a specific person). Nobody can approve their own request.
- Onboarding and offboarding: templates matched by department, location and type. Tasks needing a document require one before completion. External-system tasks need explicit confirmation and are never reported as performed by PeopleOS.
- Policies: draft, review and publish workflow with versions; the published version stays in force while a new draft is edited; acknowledgments are per version.
- Unified inbox: derived live from the underlying records, so acting on an item updates the real record. Snooze is the only state stored separately.
- Automation: triggers, conditions and actions; dedupe per record; retries up to an attempt limit; dry-run preview; run log; config change history. Email actions are recorded as *skipped* because no provider is configured.
- Analytics: computed from records only, with stated formulas; rates are `null` when there is no data; small leave groups are suppressed.
- Assistant: demo mode is a rule-based retrieval engine over the user's authorized policies and records. It is labelled as not AI, cites policy version and effective date, and says when it cannot find an answer. AI mode calls a server endpoint (`VITE_ASSISTANT_URL`); no provider key is ever in the browser.

**UI**
- New design system (indigo #4338CA, navy navigation, lavender for AI) built from Inter-based primitives.
- Responsive shell, Ctrl/Cmd+K command palette (searches authorized records only), notifications and role-aware workspace.
- Pages for all 13 modules. Accessible dialogs (focus trap and restore), tables, tabs, skip link and error boundary.

**Persistence**
- Demo driver (localStorage, fictional seed data) by default.
- Supabase driver and session wiring (auth, memberships, private storage with signed URLs) when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set.

## Verification (run locally)
- `npx tsc --noEmit`: clean
- `npx eslint .`: 0 errors (warnings only: react-refresh export hints)
- `npx vitest run`: **45/45 passed**. Covers leave math, approvals and self-approval, SLA, request transitions, internal-note privacy, record updates, balances, onboarding document and external-action rules, policy versioning and audience, automation dedupe/preview/skip, assistant citations and refusals, analytics and CSV.
- `npx vite build`: succeeds
- Browser smoke test: all 22 main routes render as HR Administrator with no console errors.

## Not done yet — please read before merging
- **Do not merge yet if you don't want the live site to change**: merging to `main` triggers the GitHub Pages deploy.
- The **Supabase migration for the PeopleOS schema is not written yet.** The `supabase/` folder from TalentNest was removed. The Supabase driver expects tables listed in `src/services/supabaseDriver.ts`, so Supabase mode will not work until that migration (plus RLS and Edge Functions for the assistant, the automation scheduler and invites) exists. Demo mode is fully functional.
- Playwright end-to-end tests for the new app, CI workflow (`ci.yml`), README rewrite and `docs/` are still to do. The old TalentNest README is still in place.
- No email, calendar, SSO or HRIS integrations exist. The Integrations page shows them honestly as not connected.
- Country-specific payroll, tax and employment-law rules are deliberately not built in; leave types and holidays must be configured.
