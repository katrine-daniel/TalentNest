# Development

## Setup

```bash
npm ci
npm run dev
```

The app opens on the demo sign-in screen. "Reset demo data" in the account menu restores the fictional data set.

## Conventions

- Business rules go in `src/domain` (pure) or `src/services` (permission check + change). Pages never modify data directly.
- A service that changes data uses one `transact()` so the record, audit event and notifications change together.
- Any permission change must be made in **both** `src/domain/permissions.ts` and the SQL `has_permission()` / policies, with tests in `tests/db/rls.check.mjs`.
- UI uses the primitives in `src/components/ui` (Button, LinkButton, Field/Input/Select, Dialog/Drawer, ConfirmDialog, Table, Tabs, Badge, Panel, EmptyState). Destructive actions go through `ConfirmDialog`.
- Colours come from the theme tokens in `src/styles/index.css`. Lavender is reserved for AI features.
- Formatting: Prettier (`npm run format`); linting: ESLint with jsx-a11y.

## Testing

```bash
npm test             # Vitest unit tests (jsdom)
npm run test:db      # applies supabase/migrations to PGlite and checks RLS as different users
npm run test:e2e     # Playwright: journeys, keyboard, responsive routes (desktop + mobile)
```

Playwright starts its own dev server on port 4174 in demo mode. Install a browser once with `npx playwright install chromium`, or use an installed one: `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e`.

`tests/db/rls.check.mjs` uses minimal stand-ins for Supabase's `auth` and `storage` schemas. It verifies the SQL on real Postgres; it does not exercise PostgREST, GoTrue or the Storage API.

Screenshots in `docs/screenshots` are captured from the running demo: `SCREENSHOTS=1 npm run screenshots`.
