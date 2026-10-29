# Changelog

## 1.0.0 — 2026-10-30

First release of **PeopleOS**, replacing the earlier TalentNest recruitment prototype (still available in Git history).

### Added

- Modules: My Workspace, AI Assistant, HR Inbox, People, Employee Requests, Leave & Attendance, Onboarding & Offboarding, Company Policies, Workforce Analytics, Workflows & Automation, Organization, Integrations, Settings.
- Demo workspace with a fictional organization and five role-based demo accounts.
- Supabase backend: schema with row-level security, separate tables for sensitive data, rule-enforcing triggers, private document storage.
- Edge Functions: `assistant` (Claude, policy-grounded with validated citations) and `invite-member`.
- Tests: 56 unit tests, 41 database policy checks on PGlite, 8 Playwright end-to-end tests; CI workflow.
- Documentation: README, architecture, development, deployment, security, contribution guide, real screenshots.

### Fixed during release validation

- Demo changes could be lost when navigating or switching account right after an action (delayed storage write).
- The assistant answered unrelated questions from policies on generic words such as "policy" and "company".
- Analytics headcount did not reconcile (start + joiners − leavers ≠ end).
- Team calendar and other scrolling tables widened the page.
- Filter bars stacked controls on separate rows; icon-only buttons rendered their icons squeezed.
- Automation could apply privileged changes in sessions that lacked permission; such actions now defer to HR sessions.
- Lifecycle completion by a non-HR assignee changed the employee record; status changes now come from HR or the scheduled checks.

### Known limitations

See the README section "Demo mode and limitations" and SECURITY.md "Known dependency advisories".
