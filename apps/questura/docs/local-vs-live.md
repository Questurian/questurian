# Local vs live

Default for UI and ordinary feature work is **Mac localhost**. The Linux laptop
is parked until a live window (Stripe, OAuth, cross-subdomain cookies, or
pre-launch proof).

## What each one is for

| Need | Where |
|---|---|
| Layout, CSS, copy, most feature clicks | `localhost:3000` / `localhost:4000` |
| Merge work in groups without a deploy per tweak | Local, then PR when the group is ready |
| Stripe Checkout, webhooks, membership truth | Live laptop |
| Google OAuth redirects | Live laptop |
| Staff/visitor cookies across `www` / `cms` / `abw` | Live laptop |

Local Postgres (`google-login` @5432) is scratch. Live DB stays on the laptop
(`questura` @5433). Local never answers “what does live Stripe do?”

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
the server. Port 6380 on purpose: on the Linux laptop, 6379 is the live
`questura-redis` container. Never point local at 6379 there, and never flush it.

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
(5 a minute, then 429) and sign-out. It exits non-zero on any failure.

It refuses to run unless the server on port 4000 uses `REDIS_URL` on
`127.0.0.1:6380`, `DATABASE_URI` on `127.0.0.1:5432`, and an **empty**
`RESEND_API_KEY` (sign-up mails a verification link otherwise). It reads these
the way Next does for the running process: its environment first, then the
`.env*` files. So start the server with email and Stripe blanked instead of
editing `.env`:

```bash
env RESEND_API_KEY= STRIPE_SECRET_KEY= pnpm --dir apps/server dev
```

(In the desktop app that is the `questura-server-offline` launch config.)
The script flushes only the `questura-local-redis` container, never port 6379,
and calls no Stripe endpoint. Test users stay in the scratch database.

## Park live (public domains go down)

Stripe webhooks to the live URL will fail until you resume. That is expected
while parked. Releases, config, Postgres, and Redis stay.

```bash
ssh linux-laptop 'bash -s' < apps/questura/infra/softprod/pause-live.sh
```

After this file is on `origin/main` and deployed once:

```bash
ssh linux-laptop '~/questura/app/apps/questura/infra/softprod/pause-live.sh'
```

## Resume live (Stripe / OAuth / cookie window)

```bash
ssh linux-laptop 'bash -s' < apps/questura/infra/softprod/resume-live.sh
```

Then, if `main` moved while parked:

```bash
ssh linux-laptop '~/questura/deploy.sh'
```

Check the real domains, not localhost. Checkout on live is a real charge.

While live is up, run everything open in `live-checks/` (top level of `apps/questura`): that folder
collects the checks merged work is still waiting on.

## Git

Local preview is not “skip GitHub.” Still branch / PR / CI. Difference: do not
`deploy.sh` for every CSS tweak. Batch, merge, and only resume+deploy when you
need a live window or a grouped release.
