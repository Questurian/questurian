# Launch day: what to run, in order

Everything here was written and proven before launch, against the readiness
sandbox (a production build on the laptop, no network, no Stripe). On the day
you run it; you do not write it. Steps marked **owner** need your yes.

Platform plan: `docs/capacity/cap07-platform-readiness.md` §1a. Clicks:
`docs/capacity/h01-provisioning-checklist.md`. Origin decision: ADR-0016.
Moving the data and the keys off the laptop, in order, with the owner steps:
`docs/procedures/cutover.md`.

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
- **Front door.** The API's port 4100 is a stand-in for Cloudflare
  (`front-door-edge.ts`) that adds the origin secret, as the Transform Rule
  will; the backend itself listens on 4110 with `ORIGIN_AUTH_SECRET` set and
  refuses anything without it (ADR-0016). Every script and the browsers call
  4100 and go through the door. The site's own renders get nothing added, so
  the client has to send the secret itself.
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
   questurian.com (`EMAIL_FROM_ADDRESS`), a missing or malformed
   `SENTRY_DSN`, and a missing `ORIGIN_AUTH_SECRET` (the API front door,
   H01 step 8).

   Email DNS (SPF, DKIM, DMARC) must be verified in Resend before this:
   `docs/procedures/email-domain.md`, steps 1 to 5.

   Sentry receives a scrubbed test event before the DSN goes on Railway
   (`docs/procedures/sentry-setup.md`, step 4):

   ```bash
   SENTRY_DSN='<the DSN>' SENTRY_ENVIRONMENT=local-proof \
     pnpm --dir apps/questura/apps/server sentry:test-event   # expect "Sent test event <id>": 1 event in Sentry, [email]/[redacted] in it, no originals
   ```

   **Backups and the migration guard are on before the first deploy.** Follow
   the one-time setup in `docs/procedures/backup-restore-rollback.md`: Neon
   history retention reads **7 days**, the R2 bucket and its 30-day rule
   exist, and the manual run of *Questura daily backup* ends with
   `Stored questura-<stamp>.dump in the off-Neon bucket` (1 dump and 1
   `.sha256` in the bucket). Railway's *Config-as-code* path is
   `/apps/questura/infra/railway/railway.json`. The first deploy's log must
   show the pre-deploy step `Checking pending database migrations`.
   Both guard suites pass:

   ```bash
   pnpm --dir apps/questura/apps/server test:deploy     # expect 13 passed: migration guard + PR migration check
   pnpm --dir apps/questura/apps/server test:softprod   # ends "railway pre-deploy tests passed", "daily backup tests passed"
   ```

2. **Rehearse locally once more** (laptop, one heavy job at a time):

   ```bash
   pnpm --dir apps/questura/apps/server readiness:stack -- up --build
   pnpm --dir apps/questura/apps/server readiness:routes     # expect 119/119: includes redirects never leaving the site
   pnpm --dir apps/questura/apps/server readiness:payments   # expect 43/43
   pnpm --dir apps/questura/apps/server readiness:purchase   # expect 54/54: a whole purchase, refunds and disputes, a failed card (past_due, grace, portal), paused, a deleted customer, fake Stripe (basil-shaped)
   pnpm --dir apps/questura/apps/server readiness:auth       # expect 29/29: sign-in and sessions, attacked
   pnpm --dir apps/questura/apps/server readiness:oauth      # expect 71/71: Google linking (fake Google), staff/visitor isolation
   pnpm --dir apps/questura/apps/server readiness:faults     # expect 26/26: Stripe, Redis, Postgres failing (Postgres frozen: 503 in ~17 s, ready 503 in ~2 s; articles locked: member body 503 + Retry-After in ~5 s)
   pnpm --dir apps/questura/apps/server readiness:contracts  # expect all ok: response shapes match both apps' types
   pnpm --dir apps/questura/apps/server readiness:front-door # expect 96/96: the origin refuses callers who skip Cloudflare (webhooks, Google, admin included), health answers, every launch page renders with the site sending the secret itself, the secret in no log
   pnpm --dir apps/questura/apps/server launch:verify -- \
     --client http://app.readiness.localhost:3100 \
     --api http://api.readiness.localhost:4100 \
     --origin-edge http://127.0.0.1:4110 \
     --allow-http --home /zz-launch/harbor --no-image-check # expect 41/41 passed
   pnpm --dir apps/questura/apps/server readiness:restore    # expect 35/35: dump, restore, boot, search, member sign-in on the restored database
   READINESS_CUTOVER_TARGET_URI=postgres://postgres@127.0.0.1:5463/questura_readiness_cutover \
   READINESS_PG_BINDIR=<dir with pg_dump/psql 17> \
     pnpm --dir apps/questura/apps/server readiness:cutover  # expect 66/66: moving day on a throwaway Postgres 17 with every secret rotated (docs/procedures/cutover.md)
   ```

   `readiness:cutover` needs a throwaway Postgres 17 on a spare loopback port
   first (the command is in `docs/procedures/cutover.md`, "Running the
   rehearsal again"); remove it afterwards.

   The full restore on Neon's Postgres major (17): bootstrap and seed a
   `questura_readiness` database in a throwaway Postgres 17 container, start
   the stack pointed at it, then (`docs/procedures/backup-restore-rollback.md`,
   "Measured so far"):

   ```bash
   export READINESS_DATABASE_URI=postgres://postgres@127.0.0.1:<spare port>/questura_readiness
   pnpm --dir apps/questura/apps/server readiness bootstrap && pnpm --dir apps/questura/apps/server readiness:launch -- seed
   pnpm --dir apps/questura/apps/server readiness:stack -- up
   READINESS_PG_BINDIR=<dir with pg_dump/psql 17> READINESS_RESTORE_EXPECT_MAJOR=17 \
     pnpm --dir apps/questura/apps/server readiness:restore   # expect 36/36 (35 + the Postgres 17 gate)
   ```

   Without a free stack slot, `readiness:restore -- --db-only` on the same
   container proves the database half: 29/29, 7 skipped, "PARTIAL".

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
     --origin-edge https://<target api.questurian.com's DNS record points at> \
     --rate-limit-probe
   ```

   It checks https and HSTS, framing headers, health, the advertised prices
   ($12.99 / $79.99), signed-out and foreign-origin callers on every payment
   route, webhook signature refusal, that the Railway origin does not serve
   the API, that a caller who connects to Railway's edge as
   `api.questurian.com` without the origin secret gets 403 (H01 step 8), and
   that forged IP headers do not buy a fresh rate-limit budget.
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
   pnpm --dir apps/questura/apps/server verify:stripe-webhook-events   # no MISSING, not DISABLED (customer.deleted included, since item 11)
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

Stop and read the failure; each one names what it saw. Roll back the side
that broke (the Worker first if both, or if you can't tell). A code rollback
never reverses a migration. For restoring data, see
`docs/procedures/backup-restore-rollback.md`. Nothing in steps 1–4 writes anything,
so re-running them is always safe.
