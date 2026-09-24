# Launch day: what to run, in order

Everything here was written and proven before launch, against the readiness
sandbox (a production build on the laptop, no network, no Stripe). On the day
you run it; you do not write it. Steps marked **owner** need your yes.

Platform plan: `docs/capacity/cap07-platform-readiness.md` §1a. Clicks:
`docs/capacity/h01-provisioning-checklist.md`. Origin decision: ADR-0016.

## Sandbox setup

Step 2 runs against the readiness sandbox: production builds of both apps on
this machine, with their own database and Redis, no network and fake
Stripe/Google. From a fresh session it needs only `docker`:

- **Postgres** is the `questura-readiness-pg` container on 127.0.0.1:5442
  (`postgres:16`, data on a tmpfs, role `postgres`, database
  `questura_readiness`). That is the default address, so no export is
  needed. `readiness:stack -- up` starts the container if it is missing,
  stopped or paused, and gives a brand-new database the schema fixture and the
  launch corpus (`readiness bootstrap`, then `readiness:launch -- seed`)
  before it builds. Set `READINESS_DATABASE_URI` only to use a different
  disposable database; `stack up` then leaves it as it is.
- **Redis** is 127.0.0.1:6390, never 6379. With no `redis-server` binary on
  PATH, `stack up` runs it as the `questura-readiness-redis` container
  (`redis:7-alpine`, no persistence), which is also what `readiness:faults`
  pauses. `stack down` removes it.
- **Rate limits.** Every step-2 script empties the sandbox Redis (6390 only)
  before it starts, so running them back to back does not spend each other's
  per-address budget. Playwright's global setup does the same.
- On the laptop that serves the live window, 5433 and 6379 are the live
  Postgres and Redis (`questura-postgres`, `questura-redis`). Nothing in the
  sandbox touches them: preflight refuses Redis on 6379 and any database not
  named `questura_readiness*`, and the container helpers refuse any other
  container name or port.
- **Memory.** About 7.5 GB. Check `free -m` first and stop below 2,500 MB
  available. `stack up --build` caps each build at 3 GB of heap. Don't start a
  second build while a stack is up, and run `readiness:stack -- down` when
  finished.

After step 2, the browser journeys run against the same stack:

```bash
pnpm --dir apps/questura/apps/e2e exec playwright test --project=chromium --project=firefox   # expect 20 passed
```

## Before the first deploy

1. **Check the Railway variables.** Fill a copy of
   `infra/railway/server.env.template` (never commit it), then:

   ```bash
   pnpm --dir apps/questura/apps/server env:check path/to/filled.env
   ```

   It must say the server would boot. It also refuses leftover placeholders,
   test-mode Stripe keys, loopback databases, sandbox variables and one secret
   used twice, a missing Resend key, a missing sender or one not on
   questurian.com (`EMAIL_FROM_ADDRESS`), and a missing or malformed
   `SENTRY_DSN`.

   Email DNS (SPF, DKIM, DMARC) must be verified in Resend before this:
   `docs/procedures/email-domain.md`, steps 1 to 5.

   Sentry receives a scrubbed test event before the DSN goes on Railway
   (`docs/procedures/sentry-setup.md`, step 4):

   ```bash
   SENTRY_DSN='<the DSN>' SENTRY_ENVIRONMENT=local-proof \
     pnpm --dir apps/questura/apps/server sentry:test-event   # expect "Sent test event <id>": 1 event in Sentry, [email]/[redacted] in it, no originals
   ```

2. **Rehearse locally once more** (laptop, one heavy job at a time):

   ```bash
   pnpm --dir apps/questura/apps/server readiness:stack -- up --build
   pnpm --dir apps/questura/apps/server readiness:routes     # expect 119/119: includes redirects never leaving the site
   pnpm --dir apps/questura/apps/server readiness:payments   # expect 43/43
   pnpm --dir apps/questura/apps/server readiness:purchase   # expect 38/38: a whole purchase, refunds and disputes, fake Stripe (basil-shaped)
   pnpm --dir apps/questura/apps/server readiness:auth       # expect 29/29: sign-in and sessions, attacked
   pnpm --dir apps/questura/apps/server readiness:oauth      # expect 71/71: Google linking (fake Google), staff/visitor isolation
   pnpm --dir apps/questura/apps/server readiness:faults     # expect 26/26: Stripe, Redis, Postgres failing (Postgres frozen: 503 in ~17 s, ready 503 in ~2 s; articles locked: member body 503 + Retry-After in ~5 s)
   pnpm --dir apps/questura/apps/server readiness:contracts  # expect all ok: response shapes match both apps' types
   pnpm --dir apps/questura/apps/server launch:verify -- \
     --client http://app.readiness.localhost:3100 \
     --api http://api.readiness.localhost:4100 \
     --allow-http --home /zz-launch/harbor --no-image-check # expect 39/39 passed
   ```

   `--no-image-check` is for the sandbox only: its images point at a CDN host
   that does not exist until launch fix plan item 8 serves them locally. It is
   printed as skipped. Against the real site the image check always runs.

   The client build itself refuses to start without real `https` addresses
   and a `pk_live_` key, and fails if its output mentions `localhost`. The
   sandbox build opts out by name (`QUESTURA_BUILD_TARGET=readiness`); the real
   build is H01 step 19, which ends with:

   ```bash
   pnpm --dir apps/questura/apps/client scan:bundle   # expect: no localhost or loopback addresses in .next/static, .open-next/assets
   ```

## After the deploy

3. **Run the launch checks against the real domains.** Read-only.

   ```bash
   pnpm --dir apps/questura/apps/server launch:verify -- \
     --client https://www.questurian.com \
     --api https://api.questurian.com \
     --bypass https://<service>.up.railway.app \
     --rate-limit-probe
   ```

   It checks https and HSTS, framing headers, health, the advertised prices
   ($12.99 / $79.99), signed-out and foreign-origin callers on every payment
   route, webhook signature refusal, that the Railway origin does not serve
   the API, and that forged IP headers do not buy a fresh rate-limit budget.
   On the home page, an article (the first in the sitemap) and an author page
   it checks for `localhost`/`127.0.0.1`, that the canonical and `og:url` are
   absolute on the site's host, that robots.txt and the sitemap name only this
   site, that one image loads as `image/*`, that a made-up path is a real 404,
   and that the site's JavaScript calls the `--api` origin.
   The last one uses up one caller's `/plans` budget for a minute.

   Every API response carries a request id, and errors reach Sentry:

   ```bash
   curl -sI https://api.questurian.com/api/health | grep -i '^x-request-id:'   # expect 1 line
   ```

   Sentry → Issues: nothing new from the deploy itself. The forced-error drill
   (one API error, one website error, each one event with a request id, alert
   on the phone) is PL4, with the owner present.

4. **The Stripe side** (live key, read-only):

   ```bash
   pnpm --dir apps/questura/apps/server verify:stripe-webhook-events   # no MISSING, not DISABLED
   QUESTURA_RECONCILE_APPLY=0 pnpm --dir apps/questura/apps/server reconcile:nightly   # 0 changes
   ```

   Stripe Dashboard → Webhooks → the new endpoint: recent deliveries all 200.

5. **Email lands in the inbox.** Request a password reset for a Gmail and an
   Outlook address you own. Both arrive in the inbox, from the configured
   sender, and "show original" says SPF, DKIM and DMARC all **pass**
   (`docs/procedures/email-domain.md`, step 6).

6. **First real purchase, owner only.** One real card, one real charge, then
   a refund. Follow `live-checks/payments.html`, checking the database row
   and `/api/me` at each step, and end with the refund and the loss of access.

## If a check fails

Stop and read the failure; each one names what it saw. `rollback` on the
platform restores the previous deploy. Nothing in steps 1–4 writes anything,
so re-running them is always safe.
