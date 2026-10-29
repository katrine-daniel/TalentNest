# Contributing

1. Branch from `main` (`feat/…`, `fix/…`).
2. Run `npm run check` (lint, types, unit tests, database tests, build) and, for workflow or UI changes, `npm run test:e2e`.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` …).
4. Open a pull request using the template; CI must pass. Merging to `main` deploys the site.

Rules that matter here:

- Never commit secrets, `.env.local`, or real personal data. Demo data must stay fictional.
- Permission changes go in both `src/domain/permissions.ts` and `supabase/migrations`, with a check in `tests/db/rls.check.mjs`.
- Do not present simulated behaviour as real: label demo features and integrations honestly.
- Keep pages free of business logic — put rules in `src/domain` or `src/services` with tests.

See [docs/development.md](docs/development.md) for setup and conventions.
