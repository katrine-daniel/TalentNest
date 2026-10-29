# Architecture

PeopleOS is a single-page React application with a pluggable persistence layer. Business rules are plain TypeScript, independent of React and of the storage backend.

```mermaid
flowchart LR
  UI[features/* pages<br/>components/*] -->|useDb()| Store[(services/store<br/>in-memory data)]
  UI -->|calls| Services[services/*<br/>permission checks + use cases]
  Services --> Domain[domain/*<br/>pure rules]
  Services -->|commit| Store
  Services -->|domain events| Automation[services/automation]
  Automation -->|commit| Store
  Store -->|persist| Demo[demoDriver<br/>localStorage]
  Store -->|persist| SB[supabaseDriver]
  SB --> PG[(Postgres + RLS + triggers)]
  UI -. policy questions .-> Fn[Edge Function: assistant] --> Claude[Claude API]
```

## Layers

| Layer                        | Responsibility                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain/`                    | Types, the role → permission matrix, leave day counts and balances, approval chains (no self-approval, delegation), SLA business hours, inbox derivation, analytics formulas, automation matching, the demo assistant. No I/O. |
| `services/`                  | One module per area. Every mutating function takes the acting account, checks permission, validates input, applies the change in one `transact()` (record + audit + notifications), and queues domain events.                  |
| `services/store.ts`          | Observable in-memory copy of the organization's data; `commit()` hands changed collections to the active driver.                                                                                                               |
| `services/demoDriver.ts`     | Whole data set in localStorage (synchronous writes).                                                                                                                                                                           |
| `services/supabaseDriver.ts` | Each collection is a `(org_id, id, data jsonb)` table; only changed rows are written. Sensitive parts are split into separate tables (below).                                                                                  |
| `features/`                  | Pages; read through `useDb()`, write only through services, report outcomes with toasts.                                                                                                                                       |

## Data model

Collections (see `src/domain/types.ts`): accounts, departments, teams, locations, employment types, schedules, holidays, employees, request types, requests, leave types, leave requests, leave adjustments, lifecycle templates, lifecycle cases, tasks, policies, policy acknowledgments, announcements, workflow rules, workflow runs, notifications, notification preferences, inbox state, audit events, assistant conversations.

Approval chains are stored on each request/leave as ordered steps with resolved approver ids, so later changes to managers don't rewrite history.

## Security model

- **Tenancy:** every row has `org_id`; RLS admits only active members of that organization.
- **Roles:** `employee`, `manager`, `hr_specialist`, `hr_admin`, `org_admin`. The matrix in `domain/permissions.ts` is mirrored by `has_permission()` in SQL.
- **Sensitive data separation:** personal fields → `employee_private` (HR + the employee); documents, equipment and history → `employee_records` (HR, the employee, their reporting line); internal notes → `request_internal_notes` (HR). The directory row has none of these.
- **Rule triggers:** non-HR users cannot reassign or reprioritise requests, decide steps they are not approvers of, approve anything they raised or that concerns them, record a decision under another name, edit leave after submission, or change checklist tasks not assigned to them.
- **Automation:** runs under the acting user's permissions; privileged actions are deferred to HR sessions (retry), so the browser never assumes a write the database would reject.
- **Assistant:** record questions are answered locally from permission-filtered data; policy questions send only RLS-visible published policies to the model. Server links are validated as same-app paths.

## Assistant modes

| Mode        | Used when                                                                             | Source label                              |
| ----------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| Demo engine | No `VITE_ASSISTANT_URL`                                                               | "Demo mode — not an AI model"             |
| Records     | Question about approvals, overdue tasks, open requests, today's work or leave balance | "Computed directly from records — not AI" |
| AI          | Policy questions with `VITE_ASSISTANT_URL` set                                        | "Generated by the configured AI provider" |

## Decisions

- **jsonb per collection instead of a column per field** — keeps one domain model for both drivers; columns needed by policies are generated from `data`.
- **Business rules in the client and guards in the database** — the client gives immediate validation and explanations; the database is the authority for anything security-relevant.
- **Inbox derived, not stored** — no duplicated state to drift; only snoozes are stored.
- **No server scheduler in v1** — honest browser-based scheduling with documented limits rather than a half-built background service.
