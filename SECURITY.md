# Security

## Reporting a vulnerability

Please report security problems privately through GitHub's **Report a vulnerability** (Security → Advisories) on this repository rather than in a public issue. Include steps to reproduce and the impact. Do not include real personal data.

## What is protected, and how

| Concern                        | Control                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization isolation         | Every table is scoped by `org_id`; RLS admits only active members (`is_member`).                                                                                                                                                            |
| Role-based access              | `has_permission()` in SQL mirrors `src/domain/permissions.ts`; policies and triggers use it. UI checks are for usability only.                                                                                                              |
| Sensitive personal data        | Stored in `employee_private` (HR and the employee only); never in the directory row; masked in change history; excluded from CSV exports.                                                                                                   |
| Employment records & documents | `employee_records` and the `documents` storage bucket: HR, the employee and their reporting line. Downloads use signed URLs valid for 60 seconds.                                                                                           |
| Internal HR notes              | `request_internal_notes`, readable by HR only.                                                                                                                                                                                              |
| Approvals                      | Triggers reject decisions by non-approvers, self-approval, decisions recorded under another name and out-of-order status changes.                                                                                                           |
| File uploads                   | Extension, MIME type and size (10 MB) are checked in the client; the bucket enforces size and MIME allow-lists.                                                                                                                             |
| Audit                          | Important changes write audit events (append-only, attributed to the caller); readable with `audit.view`.                                                                                                                                   |
| Retention                      | Departures keep the work record; organization administrators can erase personal data of former employees.                                                                                                                                   |
| Secrets                        | No secrets in the repository or the browser bundle. Only the public anon key is a build variable; the AI provider key and service-role key are Edge Function secrets.                                                                       |
| AI                             | The model sees only published policies the user may read; it never receives personal records. Answers cite sources; actions need user confirmation; links are restricted to same-app paths. AI never approves, rejects or decides anything. |
| Demo mode                      | Fictional data stored only in the visitor's browser. Demo sign-in is not authentication and is labelled as such.                                                                                                                            |

## Known dependency advisories

Checked with `npm audit` for release 1.0.0:

- **react-router-dom 6.30.6 (moderate):** open redirect via backslash paths in `<Link>`/`useNavigate`; fixed only in v7. PeopleOS links are built from internal routes; links returned by the AI service are validated as same-app paths before rendering (`isSafeHref`). Upgrade to React Router 7 is recommended in a future release.
- **vite 5 and vitest 2 (high/critical, development only):** affect the local dev server and test runner, not the built static site. Fixes require major upgrades (vite 8, vitest 5), deferred to avoid a toolchain migration in the final release. Do not expose `npm run dev` to untrusted networks.

`npm run audit:deps` (production dependencies, high and above) passes and runs in CI.

## Not covered

No penetration test has been performed. The Supabase deployment has not been exercised end to end against a live project (see README). Rate limiting exists only in the assistant function (per instance, best effort).
