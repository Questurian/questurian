# BetterAuth visitor auth spike

This spike proved the architecture from `apps/questura/docs/adr/0004-split-visitor-auth-from-staff-auth.md` and has since become the active Visitor auth runtime.

## Proven surface

- BetterAuth is mounted in Questura Server at `/api/visitor-auth/[...all]` with credentialed CORS and preflight handling.
- BetterAuth uses the same `DATABASE_URI` Postgres database through `pg.Pool`.
- BetterAuth table names are prefixed with `visitor_auth_` to keep them separate from Payload collections.
- `VisitorProfiles` is a Payload collection for public profile, membership, Stripe linkage, and affiliate referral data.
- Visitor email/password signup and Google callback hooks create a `VisitorProfiles` record.
- Staff emails are blocked from Visitor auth through `@questurian.com` domain checks and Payload `Users` lookup.
- `GET /api/me` returns a normalized Current principal from BetterAuth Visitor auth only; Payload Staff auth is ignored on the public endpoint.

## Remaining launch work

- BetterAuth verification/reset emails use the existing Payload Resend adapter and Questurian email templates.
- Production rate limiting uses Redis-backed BetterAuth secondary storage via `REDIS_URL`; database-backed limits remain local/spike-only.
- Cloudflare Turnstile support is server-wired for production signup, email login, and password-reset requests. Keep `TURNSTILE_AUTH_ENABLED=false` until the client sends `x-captcha-response`; rollout then requires `TURNSTILE_SECRET_KEY`.
- BetterAuth schema migration SQL is committed in `src/migrations/20260529000000_better_auth_visitor_tables.ts`.

## Verification

- `pnpm --filter @questura/server run generate:types`
- `pnpm --filter @questura/server exec eslint src/features/visitor-auth src/app/api/visitor-auth src/app/api/me/route.ts src/payload.config.ts`
- `DATABASE_URI=postgres://user:password@localhost:5432/questura PAYLOAD_SECRET=dev-secret BETTER_AUTH_SECRET=dev-better-secret pnpm --filter @questura/server run generate:importmap`

The full `pnpm --filter @questura/server exec tsc --noEmit` command is currently blocked by pre-existing unrelated type errors in scripts, article fields, currencies, and location helper code.
