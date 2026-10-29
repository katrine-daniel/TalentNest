## What and why

<!-- What changes, and the problem it solves. -->

## How it was verified

- [ ] `npm run lint` and `npm run typecheck`
- [ ] `npm test` (unit) and, if SQL changed, `npm run test:db`
- [ ] `npm run test:e2e` for user-facing workflow changes
- [ ] Checked in the browser (desktop and mobile width) for UI changes

## Security and data

- [ ] No secrets, real personal data or private configuration added
- [ ] Permission changes are mirrored in `src/domain/permissions.ts` **and** the database policies
- [ ] Docs updated if behaviour or setup changed
