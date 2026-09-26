# Local vs live

> **The Linux laptop is retired (2026-09-26).** Live is Cloudflare (Worker
> `questura-client` on `www.questurian.com` + `questurian.com`), Railway (API
> `questura-server` on `api.questurian.com`, Redis, us-east4) and Neon
> (Postgres 17, aws-us-east-1). The laptop's pause/resume/deploy scripts are
> historical: do not run them. How the move went and what is left:
> `docs/procedures/cutover.md` and `docs/moveday-handoff-2026-09-26.md`.

Default for UI and ordinary feature work is **Mac localhost**. Stripe, OAuth
and cross-subdomain cookies are checked on the live site.

## What each one is for

| Need | Where |
|---|---|
| Layout, CSS, copy, most feature clicks | `localhost:3000` / `localhost:4000` |
| Merge work in groups without a deploy per tweak | Local, then PR when the group is ready |
| Stripe Checkout, webhooks, membership truth | Live site (Railway API) |
| Google OAuth redirects | Live site |
| Staff/visitor cookies across subdomains | Live site |

Local Postgres (`google-login` @5432) is an old copy. Never edit it expecting
the site to change; content is edited on the live API. The live DB is Neon.
Local never answers “what does live Stripe do?”

## Local loop

```bash
cd apps/questura
pnpm dev
```

Client: `http://localhost:3000`. Server / Payload admin: `http://localhost:4000`.

Env files already point here (`apps/server/.env`, `apps/client/.env.local`).
Stripe keys on the Mac are empty on purpose — do not paste live keys into them.

### Redis (optional)

With `REDIS_URL` set, the server keeps visitor sessions and Better Auth's rate
limits in Redis — the same path production takes. Without it, sessions and
limits stay in Postgres and counters fall back to per-process memory. Use it
when the change touches sessions or rate limits:

```bash
docker compose -f infra/local/compose.yml up -d
```

Then set `REDIS_URL=redis://127.0.0.1:6380` in `apps/server/.env` and restart
the server. Port 6380 on purpose: on the retired Linux laptop, 6379 was the
live `questura-redis` container. Keep local off 6379.

Sessions are also written to Postgres (`storeSessionInDatabase`, #650), so
flushing the local Redis no longer signs anyone out: lookups fall back to
`visitor_auth_sessions` until the session next refreshes.

### Auth smoke test

A signed-in check of visitor auth against the local server, in about ten
seconds. Run it after touching sign-in, sessions, Redis, rate limits or the
payment routes' auth:

```bash
scripts/auth-smoke.sh
```

It signs up a throwaway `qa-smoke-…@example.com` user, signs in a second
session, and checks `/api/me`, `/api/account/auth-methods`, the session rows
in Postgres, a flush of the local Redis, a password change (the other
session's payment route answers 401 at once), the change-password limit
(5 a minute, then 429) and sign-out. It also calls the five `/api/payments/*`
routes as an anonymous caller (401), a signed-in non-member (404/400), a
foreign origin (403), a signed-out session and an expired one (401 even though
their `/api/me` still says signed in from the five-minute cookie cache). It
exits non-zero on any failure.

It refuses to run unless the server on port 4000 uses `REDIS_URL` on
`127.0.0.1:6380`, `DATABASE_URI` on `127.0.0.1:5432`, an **empty**
`RESEND_API_KEY` (sign-up mails a verification link otherwise) and an **empty**
`STRIPE_SECRET_KEY` (so nothing it calls reaches Stripe in either mode). It reads these
the way Next does for the running process: its environment first, then the
`.env*` files. So start the server with email and Stripe blanked instead of
editing `.env`:

```bash
env RESEND_API_KEY= STRIPE_SECRET_KEY= pnpm --dir apps/server dev
```

(In the desktop app that is the `questura-server-offline` launch config.)
The script flushes only the `questura-local-redis` container, never port 6379.
With no Stripe key, checkout's plan lookup fails closed (400) after the auth
check. Test users stay in the scratch database.

## Park / resume live (retired)

The laptop's `pause-live.sh`, `resume-live.sh` and `~/questura/deploy.sh` no
longer apply. Do **not** run `resume-live.sh`: it would start a second copy of
the site against an out-of-date database. Live is not parked any more; deploy
is by hand (Railway API deploy started yourself, Worker built in a worktree and
shipped with `opennextjs-cloudflare deploy`: `docs/capacity/h01-provisioning-checklist.md`
steps 19–20). Checkout on live is a real charge.

Run everything open in `live-checks/` (top level of `apps/questura`) against
the live site: that folder collects the checks merged work is still waiting on.

## Git

Local preview is not “skip GitHub.” Still branch / PR / CI. Difference: do not
deploy for every CSS tweak. Batch, merge, and deploy a grouped release.
