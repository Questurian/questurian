# Procedure: moving day (the laptop to the real hosting)

**Who this is for:** the owner, at the keyboard, on the day the site moves
from the Linux laptop to Cloudflare (website), Railway (API) and Neon
(database). An agent can run the commands with you, but every step that
touches live Stripe, Google, DNS or the laptop needs your yes.

**When:** after the hosting is provisioned (`docs/capacity/h01-provisioning-checklist.md`,
steps 1 to 19, without the first deploy), and before anything is announced.
Afterwards come the go-live checks (`docs/launch-day.md` steps 3 to 6, then
PL1 to PL4 in the launch fix plan).

**How long:** about an hour. The site is down for readers from step 4 until
step 11, usually 20 to 30 minutes.

**Rehearsed:** the whole move, on sandbox data, on 2026-09-25 (launch fix
plan item 5): `pnpm --dir apps/questura/apps/server readiness:cutover`, 66/66
checks, evidence in `docs/capacity/runs/2026-09-25-cutover-rehearsal.json`.
What it proved is in [What the rehearsal proved](#what-the-rehearsal-proved).

---

## What changes for people

The new API gets new secrets that the laptop never had. That is on purpose
(the laptop is being retired, and its secrets lived on a machine that sleeps
in a bag), and it has these effects. None of them is an error.

| Who | What they notice | What they do |
|---|---|---|
| **Readers with a password** | Signed out once. | Sign in again. Their password still works. |
| **Readers who use Google** | Signed out once. | Sign in with Google again. It works, and it is still the same account. |
| **Members** | Signed out once. Their membership is untouched. | Sign in again; paid articles open. |
| **Staff (admin panel and the writer tool)** | Signed out once. | Sign in again at `https://api.questurian.com/admin`. Passwords still work. |
| **Location Manager** | Its key stops working (401). | You issue a new key in step 13 and put it in its settings. |
| **Anyone holding an email link sent before the move** (verify address, reset password) | The link may not work. | Ask for a new one. |

Why: sign-in cookies and staff tokens are signed with `BETTER_AUTH_SECRET` and
`PAYLOAD_SECRET`, and Payload finds a service key by a fingerprint made with
`PAYLOAD_SECRET`. Stored Google tokens are encrypted with `BETTER_AUTH_SECRET`;
they are replaced the next time the reader signs in with Google, and nothing
in Questura reads them in between. Passwords are stored without any secret,
so they carry over.

---

## Every key, and where it lives

Make new values for everything marked **new**. Nothing from the laptop's
`~/questura/config/server.env` is reused, except where the table says so.
`env:check` (step 1) refuses one value used for two things.

| Key | New? | Where it goes | Who reads it |
|---|---|---|---|
| `PAYLOAD_SECRET` | **new**, 64 random characters | Railway | the API (staff sign-in, service keys) |
| `BETTER_AUTH_SECRET` | **new**, not the same as `PAYLOAD_SECRET` | Railway | the API (reader sign-in, stored Google tokens) |
| `ORIGIN_AUTH_SECRET` | **new**, 64 characters | Railway, **and** the Worker secret `ORIGIN_AUTH_SECRET`, **and** the Cloudflare Transform Rule that sets `X-Questura-Origin-Auth` on `api.questurian.com`, **and** the Railway edge rule if the plan has one (H01 step 8) | the API's front door (ADR-0016). All must be the same value. |
| `QUESTURA_REVALIDATION_SECRET` | **new** | Railway and the Worker secret of the same name | publishing refreshes the website |
| `QUESTURA_RENDER_TOKEN` | **new**, 32+ characters | Railway and the Worker secret of the same name | the website's own page renders |
| `REFRESH_WORKER_SECRET`, `DB_STATS_SECRET`, `EXCHANGE_RATE_SYNC_SECRET` | **new** | Railway, and whatever scheduler calls those routes (ADR-0015) | internal routes |
| `STRIPE_SECRET_KEY` | **new** restricted `rk_live_` key, narrowed to what the app calls (`docs/serverless-launch-checklist.md` §7) | Railway | the API |
| `STRIPE_WEBHOOK_SECRET` | **new**: the signing secret of the new endpoint made in step 2 | Railway | the API checks every Stripe webhook with it |
| `STRIPE_PRICE_ID_MONTHLY` / `_YEARLY` | the **catalog** prices ($12.99 / $79.99), not the laptop's $0.50 | Railway | Checkout (`docs/membership-pricing.md`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | the live `pk_live_` key | the Worker **build** (H01 step 18) | the website |
| `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` | **new** sending-only key; sender on questurian.com | Railway | email (`docs/procedures/email-domain.md`, step 5) |
| `SENTRY_DSN` | from the Sentry project | Railway | error reports (`docs/procedures/sentry-setup.md`, step 5) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | same Google client; resetting the secret afterwards is recommended (it lived on the laptop) | Railway | Google sign-in. The new redirect address is added in step 3. |
| `BUNNY_STORAGE_API_KEY` and the Bunny names | same account; a new key is recommended | Railway | image uploads |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` | from H01 steps 12 and 16 | the Worker secrets | the website's cache purge |
| Backup: `QUESTURA_BACKUP_DATABASE_URL`, `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY` (secrets), `QUESTURA_BACKUP_S3_URI`, `QUESTURA_BACKUP_S3_ENDPOINT`, `QUESTURA_BACKUP_ENABLED` (variables) | **new** | GitHub → repository → Settings → Secrets and variables → Actions | the daily backup (`docs/procedures/backup-restore-rollback.md`, "One-time setup") |
| **Location Manager's service key** | **new**, issued in step 13 | Location Manager's server settings: `PAYLOAD_API_KEY` (and `PAYLOAD_API_URL=https://api.questurian.com`) in `apps/location-manager/packages/server/.env` on the machine that runs it | Location Manager, as the `Location Manager` service account (ADR-0006) |
| **The writer tool (ABW)** | no key: it uses the staff sign-in cookie | its settings: `PAYLOAD_API_URL` (backend) and `VITE_PAYLOAD_API_URL` (frontend, then rebuild) → `https://api.questurian.com`. Its host must be in `PAYLOAD_COOKIE_REQUIRED_HOSTS` on Railway (the template already lists `abw.questurian.com` and `abw-api.questurian.com`) | writers sign in again |

Never paste a key into a chat, a pull request or a document. Put each one
straight into the place in the third column.

---

## Before the day

1. **Railway's variables pass the check.** Fill a copy of
   `infra/railway/server.env.template` with the table above (never commit it):

   ```bash
   pnpm --dir apps/questura/apps/server env:check path/to/filled.env   # must say the server would boot
   ```

   `STRIPE_WEBHOOK_SECRET` comes from step 2; put a placeholder in until then
   and run this again after step 2.

2. **Make the new Stripe webhook endpoint now, before the laptop goes down.**
   Stripe Dashboard (live) → Developers → Webhooks → Add endpoint:
   - URL `https://api.questurian.com/api/payments/webhooks/stripe`
   - API version **`2025-08-27.basil`** (pick it explicitly; the Dashboard
     offers its newest version by default). It must equal `STRIPE_API_VERSION`
     in `apps/server/src/features/payments/lib/stripe-api-version.ts`.
   - Events, exactly these ten: `checkout.session.completed`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `customer.deleted`,
     `invoice.payment_succeeded`, `invoice.payment_failed`,
     `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`
     (the list in `apps/server/src/features/payments/webhooks/handled-events.ts`).
   - Copy its signing secret into `STRIPE_WEBHOOK_SECRET` on Railway.

   Why now: from this moment Stripe sends every event to both endpoints. The
   new one fails until the API is deployed, and Stripe keeps retrying it, so
   events that happen while the site is moving arrive at the new host when it
   is up instead of being lost. Duplicates are harmless: the API records every
   event id and ignores one it has already seen, and the dump carries those
   records across.

3. **Google knows the new address.** Google Cloud console → APIs & Services →
   Credentials → the OAuth client → Authorised redirect URIs → add
   `https://api.questurian.com/api/visitor-auth/callback/google`. Keep the
   laptop's address for now; it is removed in step 16.

---

## The day

Write down the time at each step.

4. **Park the laptop.** Nobody can sign up, pay or publish on it after this,
   so nothing is written that the dump would miss.

   ```bash
   ssh linux-laptop 'bash -s' < apps/questura/infra/softprod/pause-live.sh
   ```

   It stops the site, the API and the tunnel, and switches off the nightly
   reconcile and the healthcheck timers. Postgres keeps running.

5. **The final dump** (on the laptop, Postgres 16):

   ```bash
   ssh linux-laptop 'docker exec questura-postgres pg_dump -U questura -d questura --no-owner --no-privileges' \
     > questura-final-$(date -u +%Y%m%dT%H%MZ).sql
   ```

   Keep this file somewhere private until the move has been fine for 30 days.
   It holds readers' email addresses.

6. **Restore into Neon** (Postgres 17, with a 17 client, stopping on the first
   error, as one transaction, so it either all arrives or nothing does):

   ```bash
   docker run --rm -i postgres:17 psql '<Neon direct connection string>' \
     -q -v ON_ERROR_STOP=1 --single-transaction < questura-final-<stamp>.sql
   ```

   Any error: stop. Neon is still empty or unchanged (one transaction), so
   fix and run it again, or go back with [If it goes wrong](#if-it-goes-wrong).

7. **Compare the counts.** Run this against the laptop and against Neon and
   put the two results side by side. Every number must match.

   ```sql
   SELECT 'locations' AS t, count(*) FROM locations UNION ALL
   SELECT 'articles', count(*) FROM articles UNION ALL
   SELECT 'media_assets', count(*) FROM media_assets UNION ALL
   SELECT 'media_sets', count(*) FROM media_sets UNION ALL
   SELECT 'users', count(*) FROM users UNION ALL
   SELECT 'service_accounts', count(*) FROM service_accounts UNION ALL
   SELECT 'visitor_profiles', count(*) FROM visitor_profiles UNION ALL
   SELECT 'visitor_auth_users', count(*) FROM visitor_auth_users UNION ALL
   SELECT 'visitor_auth_accounts', count(*) FROM visitor_auth_accounts UNION ALL
   SELECT 'visitor_auth_sessions', count(*) FROM visitor_auth_sessions UNION ALL
   SELECT 'visitor_auth_verifications', count(*) FROM visitor_auth_verifications UNION ALL
   SELECT 'bookmarks', count(*) FROM bookmarks UNION ALL
   SELECT 'stripe_webhook_events', count(*) FROM stripe_webhook_events UNION ALL
   SELECT 'payload_migrations', count(*) FROM payload_migrations;
   ```

   Laptop: `ssh linux-laptop 'docker exec -i questura-postgres psql -U questura -d questura' < counts.sql`.
   Neon: `docker run --rm -i postgres:17 psql '<Neon direct connection string>' < counts.sql`.

8. **Deploy the API** (Railway). Railway's pre-deploy step migrates the
   database forward (guard, migrate, guard again, search index), the same
   script the rehearsal ran. The deploy log must show
   `Checking pending database migrations` and end with `Pre-deploy complete`.
   If the pre-deploy fails, the deploy stops and nothing serves; read the log.

   Then run the step 7 query against Neon again: the same numbers, except
   `payload_migrations`, which may grow by the migrations newer than the
   laptop's last deploy.

9. **Check the API answers** before anyone can see it:

   ```bash
   curl -s https://api.questurian.com/api/health            # answers
   curl -s -o /dev/null -w '%{http_code}\n' https://api.questurian.com/api/me   # 200: through Cloudflare, the Transform Rule adds the origin secret
   ```

   That a caller who skips Cloudflare gets 403 is checked in step 12
   (`launch:verify --edge-ip`, required since launch fix plan item 6).

10. **Deploy the website** (H01 step 20).

11. **Point the domains at the new site.** Cloudflare → DNS: `www.questurian.com`
    and `questurian.com` go to the Worker (its custom domains), replacing the
    tunnel records. Delete the tunnel's `cms.questurian.com` record: the API
    is `api.questurian.com` now.

12. **Run the launch checks** against the real domains, read-only:
    `docs/launch-day.md` step 3 (`launch:verify`, every check must pass) and
    step 4 (`verify:stripe-webhook-events`: the new endpoint at the pinned
    version with no `MISSING`).

13. **Re-issue Location Manager's key.** Sign in at
    `https://api.questurian.com/admin` → Service Accounts → `Location Manager`
    → generate a new API key → copy it → Save. Put it in Location Manager's
    `PAYLOAD_API_KEY`, set `PAYLOAD_API_URL=https://api.questurian.com`, and
    restart Location Manager. The old key already gets 401; the rehearsal
    proved the new one works. Do the same for any other service account in the
    list (the rehearsal found only this one in use).

    Point the writer tool at the new API (the table above) and sign in to it
    again.

14. **Catch up with Stripe.** Events that happened between step 4 and now are
    being retried to the new endpoint, some of them hours apart. Don't wait:
    run the reconcile, dry run first.

    ```bash
    QUESTURA_RECONCILE_APPLY=0 pnpm --dir apps/questura/apps/server reconcile:nightly
    ```

    On a quiet pre-launch site it lists **0 changes**. If it lists changes,
    read them, then run it without `QUESTURA_RECONCILE_APPLY=0`. Anything it
    lists for a human (exit 1) is a real person's access: resolve each one.
    Then Stripe Dashboard → Webhooks → the new endpoint: recent deliveries all
    200.

15. **Owner decision D6: the two members paying $0.50.** The laptop's Checkout
    charged the $0.50 test price (`docs/membership-pricing.md`); two live
    subscriptions are on it. The new host charges the catalog price to new
    members only. Existing subscriptions keep their own price, and access does
    not depend on which price it is.

    Find them: Stripe Dashboard (live) → Billing → Subscriptions → product
    *Questurian Membership*, price $0.50/month
    (`price_1U5aq5BUOUSxLiOZMnZHT1eS`), status active. Look at each customer's
    email.

    - **Your own test accounts:** refund in full
      (`docs/procedures/refund-a-membership.md`). The app then cancels the
      subscription and removes access by itself. Check the subscription shows
      *Canceled* and the payment *Refunded*.
    - **A real reader:** do nothing. They keep $0.50 until they cancel; do not
      move them to $12.99 without asking them. Write their customer id here,
      so nobody "fixes" it later:

      | Stripe customer | Real reader or test? | What was done | Date |
      |---|---|---|---|
      | | | | |
      | | | | |

---

## Retire the laptop

Do these the same day, once step 14 is clean. Each one stops the laptop doing
something on its own behalf that it no longer should.

16. **Its Stripe webhook endpoint.** Stripe Dashboard → Webhooks → the
    endpoint pointing at `cms.questurian.com` → *Disable*. (Delete it after 30
    days.) `verify:stripe-webhook-events` then reports it `DISABLED`, which is
    expected and does not fail.
    Google Cloud console: remove the `cms.questurian.com` redirect address
    from the OAuth client.

17. **Its Stripe key.** Stripe Dashboard → Developers → API keys → the
    restricted key the laptop used (ends in `1dDj`, named for the Linux
    laptop) → *Delete* (or *Roll* and throw the new value away). From then on
    `apps/questura/scripts/stripe-live` stops working; that is expected, and
    the new host's key is used for live reads instead.

18. **Its nightly job.** Step 4 switched the timers off; make sure they stay
    off and cannot come back with a resume:

    ```bash
    ssh linux-laptop 'systemctl --user disable --now questura-reconcile.timer questura-healthcheck.timer; systemctl --user list-timers | grep questura || echo "no questura timers"'
    ```

    Do **not** run `resume-live.sh` again: it would start a second copy of the
    site against a database that is now out of date.

19. **Tell the repository.** `AGENTS.md` still says the laptop serves the live
    domains and that live Stripe reads go through the laptop key. Ask an agent
    to update it (and `docs/local-vs-live.md`, `docs/membership-pricing.md`,
    `infra/softprod/README.md`) to say the laptop is retired and Railway is
    live.

After 30 days of a healthy site: delete the laptop's containers, config and the
final dump file, and delete the Cloudflare tunnel.

---

## If it goes wrong

- **Before step 11** (the domains still point at the laptop): nothing was
  written on the new host that matters. Resume the laptop
  (`ssh linux-laptop 'bash -s' < apps/questura/infra/softprod/resume-live.sh`),
  and it serves exactly what it had at step 4. Try again another day. Disable
  the new Stripe endpoint in the meantime, or it keeps failing.
- **After step 11** (readers and Stripe have reached the new host): fix
  forward. Going back to the laptop loses every sign-up, payment and edit made
  since step 11. To roll back a bad release, see
  `docs/procedures/backup-restore-rollback.md`, "Rolling back a release".

---

## What the rehearsal proved

`readiness:cutover` (2026-09-25, 66/66) did the move on sandbox data, in this
order, and checked:

- **Before:** on the stack standing in for the laptop, a member, staff and a
  Google reader signed in, and the `Location Manager` key worked.
- **Dump and restore:** Postgres 16.14 dumped with a 17 client, restored into
  Postgres 17.11 with `ON_ERROR_STOP` in one transaction (dump 0.3 s, restore
  0.6 s). All 14 counted tables matched, before and after the migrate step.
- **Migrate:** `scripts/deploy/pre-deploy.sh`, Railway's own step, passed on the
  restored database with the new `PAYLOAD_SECRET`. (The sandbox was already
  at the newest migration, so it applied none; the Postgres 17 restore proof
  below applied two on 17.)
- **New host, every secret rotated** (`PAYLOAD_SECRET`, `BETTER_AUTH_SECRET`,
  `ORIGIN_AUTH_SECRET`, the webhook secret, the revalidation and render
  tokens), on an empty Redis:
  - the laptop's origin secret gets 403; the new one is let in;
  - an old reader cookie: `/api/me` says signed out (200), bookmarks and
    sign-in methods answer 401, get-session finds nothing, the member article
    stays locked; never 500;
  - an old staff token gets 401; an old staff cookie is nobody; never 500;
  - the old `Location Manager` key gets 401, before and after a new one is
    issued; the new key issued by an admin on the new host works;
  - a webhook signed with the laptop endpoint's secret gets 400; one signed
    with the new secret gets 200;
  - a member signs in with the restored password, is still a member and is
    served the member article; staff signs in and can list service accounts;
  - a new reader signs up with Google (the sandbox's fake Google), and a
    reader whose Google token was stored under the old secret signs in with
    Google as the same account, lists their sign-in methods (200) and has the
    token replaced under the new secret.

The full restore drill (`readiness:restore`: boot the API on the restored
database, search, a member's article) also passed on Postgres 17.11, 36/36
(`docs/capacity/runs/2026-09-25-surge-L09-restore-pg17.json`).

Not rehearsed, because only the real platform has them: the Transform Rule and
Railway edge rule, Neon itself, Stripe's retries to the new endpoint, the
Google console, and DNS. Steps 9, 12 and 14 check those on the day.

### Running the rehearsal again

```bash
docker run -d --rm --name questura-cutover-pg17 -p 127.0.0.1:5463:5432 \
  -e POSTGRES_HOST_AUTH_METHOD=trust --tmpfs /var/lib/postgresql/data postgres:17
pnpm --dir apps/questura/apps/server readiness:stack -- up
READINESS_CUTOVER_TARGET_URI=postgres://postgres@127.0.0.1:5463/questura_readiness_cutover \
READINESS_PG_BINDIR=<dir with pg_dump and psql 17> \
  pnpm --dir apps/questura/apps/server readiness:cutover   # expect 66/66
pnpm --dir apps/questura/apps/server readiness:stack -- down
docker rm -f questura-cutover-pg17
```

`READINESS_PG_BINDIR` can hold two one-line wrappers, `pg_dump` and `psql`,
each `exec docker run --rm -i --network host postgres:17 <tool> "$@"`. The
target refuses ports 5432, 5433, 5442, 6379 and 6390 and any database name but
`questura_readiness_cutover`.
