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
step 11, usually 20 to 30 minutes. Editing is frozen on the Mac from step 4
too, until the writer tool points at the new API (step 13).

**Rehearsed:** the whole move, on sandbox data, on 2026-09-25 (launch fix
plan item 5): `pnpm --dir apps/questura/apps/server readiness:cutover`, 66/66
checks, evidence in `docs/capacity/runs/2026-09-25-cutover-rehearsal.json`.
What it proved is in [What the rehearsal proved](#what-the-rehearsal-proved).
The merge of the Mac's and the laptop's databases (step 5) was rehearsed on
the real dumps of 2026-09-25, into Postgres 16 and 17, and the API and
website booted on the result: [Merging the two databases](#merging-the-two-databases).

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
| `STRIPE_MANAGED_PAYMENTS` | leave **unset (off)** on the day | Railway | Checkout: `on` makes Stripe the merchant of record for sales tax. Turned on later, in [Sales tax](#sales-tax-turn-on-stripe-managed-payments) |
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

4. **Freeze editing on BOTH machines.** There are two databases, and each
   holds half of the truth ([Merging the two databases](#merging-the-two-databases)):
   the Mac has the newer content, the laptop has the readers and payments.
   Anything written to either after its dump is lost.

   - **The Mac:** stop everything that writes to its database: the Questura
     server (`pnpm dev`, port 4000), Location Manager, and the writer tool
     (ABW). Close the admin panel.
   - **The laptop:** park it. Nobody can sign up, pay or publish on it after
     this.

     ```bash
     ssh linux-laptop 'bash -s' < apps/questura/infra/softprod/pause-live.sh
     ```

     It stops the site, the API and the tunnel, and switches off the nightly
     reconcile and the healthcheck timers. Postgres keeps running.

5. **The final dumps, and the merge.** Both dumps only read. Work in a private
   folder outside the repository: the files hold readers' email addresses.

   ```bash
   mkdir -m 700 -p /tmp/questura-move && cd /tmp/questura-move && umask 077
   # the laptop (Postgres 16): readers, members, payments
   ssh linux-laptop 'docker exec questura-postgres pg_dump -U questura -d questura -Fc --no-owner --no-privileges' > laptop.dump
   # the Mac (Postgres 14): content and schema
   /opt/homebrew/opt/postgresql@17/bin/pg_dump -Fc --no-owner --no-privileges \
     'postgres://google_app@127.0.0.1:5432/google-login' > mac.dump
   ```

   Then merge them in a throwaway Postgres 17 on the Mac, and stop it after
   ([the runbook](#runbook-merging-on-moving-day) has the exact commands):

   ```bash
   PG_BINDIR=/opt/homebrew/opt/postgresql@17/bin \
     apps/questura/apps/server/scripts/cutover/merge-databases.sh \
     --mac mac.dump --laptop laptop.dump \
     --scratch postgres://postgres@127.0.0.1:5471 --out merged.sql
   ```

   It must end with `it restores with identical row counts`. Read its report
   ([what to expect](#what-the-report-says)). If it stops, nothing was
   written anywhere: read the reason, fix it, dump again.

   Keep `laptop.dump`, `mac.dump` and `merged.sql` somewhere private until the
   move has been fine for 30 days.

6. **Restore the merged dump into Neon** (Postgres 17, with a 17 client,
   stopping on the first error, as one transaction, so it either all arrives
   or nothing does):

   ```bash
   /opt/homebrew/opt/postgresql@17/bin/psql '<Neon direct connection string>' \
     -q -v ON_ERROR_STOP=1 --single-transaction -f merged.sql
   ```

   (`docker run --rm -i postgres:17 psql …` works as well, where docker is
   installed.) Any error: stop. Neon is still empty or unchanged (one
   transaction), so fix and run it again, or go back with
   [If it goes wrong](#if-it-goes-wrong).

7. **Compare the counts.** Run this against the Mac, the laptop and Neon and
   put the three results side by side. Each Neon number must equal its
   source: `visitor_*`, `stripe_webhook_events` and `service_accounts` equal
   the laptop's; everything else equals the Mac's, except `bookmarks`, which
   is the Mac's minus the number the merge report says it dropped.

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
   Mac: `/opt/homebrew/opt/postgresql@17/bin/psql 'postgres://google_app@127.0.0.1:5432/google-login' < counts.sql`.
   Neon: `/opt/homebrew/opt/postgresql@17/bin/psql '<Neon direct connection string>' < counts.sql`.

8. **Deploy the API** (Railway). Railway's pre-deploy step migrates the
   database forward (guard, migrate, guard again, search index), the same
   script the rehearsal ran. The deploy log must show
   `Checking pending database migrations` and end with `Pre-deploy complete`.
   If the pre-deploy fails, the deploy stops and nothing serves; read the log.

   Then run the step 7 query against Neon again: the same numbers, except
   `payload_migrations`, which grows by the migrations newer than the Mac's
   (three on 2026-09-25, all rated `automatic-safe` by the guard).

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

The Mac's `google-login` database is no longer a source either: from step 6
on, content is edited on the new API only. Point Location Manager and the
writer tool there (step 13) and do not edit locally expecting it to reach the
site.

After 30 days of a healthy site: delete the laptop's containers, config and the
final dump files (`laptop.dump`, `mac.dump`, `merged.sql`), and delete the
Cloudflare tunnel.

---

## Sales tax: turn on Stripe Managed Payments

**When:** after the site is live on the new hosting, **before it is
announced**. Until the last step, Checkout charges no tax and `/join` makes no
tax promise; that is correct, not a gap.

**What it is:** Stripe (through Link) becomes the merchant of record and
calculates, collects, files and remits sales tax/VAT for every new membership,
for +3.5% per sale (`docs/membership-pricing.md`, "Sales tax"). The code
shipped switched off; this turns it on by config. An agent never does steps
T1 to T4: they are live Stripe and live hosting, and need you.

T1. **Ask Stripe for it (owner).** Stripe Dashboard (live) → Settings →
    **Managed Payments** (`https://dashboard.stripe.com/settings/managed-payments`)
    → request it and accept the Managed Payments terms. While you are there:
    Settings → Business details → the **support email** must be one you read.
    Stripe sends buyer escalations there and may refund a buyer itself if
    nobody answers within 48 hours.

T2. **Wait for the approval.** Nothing else changes meanwhile. Leave
    `STRIPE_MANAGED_PAYMENTS` unset on Railway: turned on before approval,
    every Checkout would fail.

T3. **Give the product its tax code (owner, once approved).** Stripe Dashboard
    (live) → Product catalog → *Questurian Membership* → ⋯ → **Edit product**
    → Product tax code: **`txcd_10303002`** (Digital Magazines/Periodicals –
    viewable only – subscription – with conditional rights; it is labelled
    *Eligible for Managed Payments*) → Update product. Do not change the
    prices: their tax behaviour stays unset, so tax is added on top of $12.99
    and $79.99.

T4. **Flip the switch (owner).** Railway → the API service → Variables →
    `STRIPE_MANAGED_PAYMENTS=on` → deploy. (`on` or `off` only; any other value
    refuses to boot, so a typo shows up as a failed deploy, not as silent
    no-tax.) Then check, read-only:

    ```bash
    curl -s https://api.questurian.com/api/payments/plans | grep -o '"taxAtCheckout":[a-z]*'   # "taxAtCheckout":true
    ```

    Within about a minute (the page caches the plans for 60 seconds),
    `https://www.questurian.com/join` ends with "Sales tax or VAT is added at
    checkout where it applies, and checkout may show the total in your own
    currency."

T5. **One real $12.99 purchase, owner only** (`docs/launch-day.md` step 6, the
    same page and the same refund; do it again if you already did it before
    T4). What is new: the Checkout page is Link's, it adds tax for a taxable
    billing address, the receipt comes from Link and **shows the tax**, and the
    card statement reads `LINK.COM* …`. The full refund includes the tax, and
    access still ends within a minute of it.

**To undo:** set `STRIPE_MANAGED_PAYMENTS=off` and deploy. New checkouts are
unmanaged again and `/join` drops the tax line. Memberships bought while it was
on stay with Stripe as merchant of record; Stripe keeps handling their tax.
Memberships bought before T4 (including the two $0.50 ones in step 15) never
become managed and are never taxed.

---

## If it goes wrong

- **Before step 11** (the domains still point at the laptop): nothing was
  written on the new host that matters. Resume the laptop
  (`ssh linux-laptop 'bash -s' < apps/questura/infra/softprod/resume-live.sh`),
  and it serves exactly what it had at step 4. Neither real database was
  written by the merge, so the Mac's is also as it was. Try again another
  day, with fresh dumps. Disable the new Stripe endpoint in the meantime, or
  it keeps failing.
- **After step 11** (readers and Stripe have reached the new host): fix
  forward. Going back to the laptop loses every sign-up, payment and edit made
  since step 11. To roll back a bad release, see
  `docs/procedures/backup-restore-rollback.md`, "Rolling back a release".

---

## Merging the two databases

Found on 2026-09-25 by comparing the two, read-only: since the copies split
(2026-08-12, the last migration both recorded at the same moment), the site's
data lives in two places.

- **The Mac** (`google-login`, Postgres 14) has a month of newer content and
  14 newer migrations: authors and bylines, homepage blocks, the main
  homepage, listicles, dining, 58 more media assets, exchange rates, the
  `bookmarks` and `public_search_documents` tables.
- **The laptop** (`questura`, Postgres 16) has the real readers, members and
  payments: 3 readers (the Mac has 2 of them), their memberships, 24 Stripe
  webhook events, 15 sent emails, and on 2026-08-16 the owner made 2 articles
  and 5 itineraries members-only there.

Moving only one of them loses the other half, so the move merges them with
`apps/server/scripts/cutover/merge-databases.sh` (rules and checks in
`merge-databases.sql`, next to it).

### Where each table comes from

| Source | Tables | Why |
|---|---|---|
| **Laptop**, row for row | `visitor_auth_users`, `visitor_auth_accounts`, `visitor_auth_sessions`, `visitor_auth_verifications`, `visitor_auth_rate_limits`, `visitor_profiles`, `stripe_webhook_events`, `email_logs`, `service_accounts` | Readers, memberships and money happened on the live site. Their id counters carry on from the laptop's. The Mac's own rows here are local tests: one Google sign-in link and one session made on the Mac are dropped; its `email_logs` 6 to 8 were failed local sends that reuse the ids of the laptop's real membership emails. `service_accounts` differ only in the key, which is re-issued in step 13 anyway. |
| **Merged** | `identity_email_owners` | One email, one owner. Staff rows follow `users` (Mac), reader rows follow `visitor_auth_users` (laptop). The check rebuilds it from both and requires an exact match. |
| **Merged** | `articles.access`, `listicle_itineraries.access` | The paywall. The migration that added it ran on the laptop first (08-15) and the owner set members-only content there (08-16). The Mac got the column on 08-20 with the default, `free`. On rows the laptop edited after the split, the laptop's value wins; everything else in the row is the Mac's. |
| **Mac**, minus orphans | `bookmarks` | Only the Mac has the table. A bookmark whose reader is not among the laptop's readers is dropped (none on 2026-09-25: both belong to readers the laptop has). |
| **Emptied** | `payload_locked_documents` (+`_rels`) | Editing locks of admin sessions that end at the move. |
| **Mac** | everything else: content, media, homepages, `users` (staff) and `users_sessions`, `payload_preferences`, `payload_kv`, `refresh_jobs`, `public_search_documents`, `payload_migrations` | Newer content and the newer schema. Staff passwords are the same on both sides (only `updated_at` differs on one staff row). Staff sessions end at the move anyway. |

The laptop's tables need no migration first: every laptop-sourced table has
exactly the columns of the Mac's schema, and the merge refuses if that ever
stops being true. The merged database ends at the Mac's migrations; Railway's
pre-deploy (step 8) then applies the newer ones.

Checked and **not** a difference: `accommodations`, `attractions`, `tours`,
`nightlife` looked 4 hours apart when compared by hand. Row by row they are
identical; it was the same instant shown in two time zones.

### What the merge refuses

It runs every rule and check in one transaction on a throwaway Postgres, so a
failure leaves nothing half-done, and it never connects to either real
database. It stops when:

- the laptop edited content **after the split** that the Mac does not have
  (the row, or its blocks and relations), and the laptop's edit is the newer
  one: the merge would lose it. Make the same edit on the Mac, dump again.
  (`--accept-lost-laptop-edits` merges anyway and lists what was dropped.)
- the laptop has a table or a migration the Mac lacks;
- a laptop column does not exist on the Mac, or a Mac-only column has no default;
- any row count differs from its source, or a laptop table is not the
  laptop's rows exactly;
- any foreign key points at nothing;
- `identity_email_owners` does not match staff plus readers;
- a membership profile belongs to no reader, or one Stripe customer is linked
  to two profiles (ownership is `visitor_profiles.auth_user_id`, the value
  stamped on the Stripe customer as `metadata.visitorAuthUserId`, never the
  email);
- a bookmark belongs to no reader;
- `payload_migrations` is not the Mac's;
- the merged dump does not restore to the same counts.

It also refuses a scratch server that is not on this machine, that uses port
5432, 5433, 5442, 6379 or 6390, that has a password in its address, or that
holds any other database; and an output path inside a git checkout.

### What the report says

On 2026-09-25 it printed (and the move-day run should look the same, give or
take new readers and events):

```
split: copies split after 2026-08-12 12:15 UTC
edited on both sides, Mac newer, Mac kept: articles id 32: laptop differs in author_id
edited on both sides, Mac newer, Mac kept: currencies 23 rows: laptop differs in latest_usd_rate_*
bookmarks: 0 dropped (reader not on the laptop)
laptop value kept: articles.access: 2 rows
laptop value kept: listicle_itineraries.access: 5 rows
people: 3 readers, 3 profiles (3 with a Stripe customer), 5 sign-in methods, 24 webhook events, 15 email logs
schema: 47 migrations, last 20260921_214514_refresh_jobs_outbox
```

"Edited on both sides, Mac newer" lines are the Mac's later edit replacing an
older laptop value; read them, and stop if one is a laptop edit you want to
keep. Article 32: the Mac changed its author, the laptop made it
members-only; both survive. Currencies: the exchange-rate sync ran on both
machines; the Mac's is newer.

### Runbook: merging on moving day

From the repository root on the Mac, after step 4 (editing frozen on both):

```bash
REPO=$(pwd)
export LC_ALL=en_US.UTF-8          # without it initdb fails ("postmaster became multithreaded")
PG17=/opt/homebrew/opt/postgresql@17/bin   # brew install postgresql@17 if missing
mkdir -m 700 -p /tmp/questura-move && cd /tmp/questura-move && umask 077

# 1. a throwaway Postgres 17 on port 5471, data under /tmp
$PG17/initdb -D /tmp/questura-move/pg -U postgres -A trust >/dev/null
$PG17/pg_ctl -D /tmp/questura-move/pg -l /tmp/questura-move/pg.log \
  -o "-p 5471 -k /tmp/questura-move -c listen_addresses=127.0.0.1" start

# 2. the two dumps (step 5 above), then the merge
PG_BINDIR=$PG17 "$REPO"/apps/questura/apps/server/scripts/cutover/merge-databases.sh \
  --mac mac.dump --laptop laptop.dump \
  --scratch postgres://postgres@127.0.0.1:5471 --out merged.sql

# 3. stop and delete the throwaway server; keep the three files private
$PG17/pg_ctl -D /tmp/questura-move/pg stop && rm -rf /tmp/questura-move/pg /tmp/questura-move/pg.log
```

Optional, before touching Neon: prove the API boots on it, exactly as the
rehearsal did. Load `merged.sql` into `questura_readiness_restore` on the
throwaway server (step 6's command), run
`DATABASE_URI=postgres://postgres@127.0.0.1:5471/questura_readiness_restore PAYLOAD_SECRET=<random> bash apps/questura/apps/server/scripts/deploy/pre-deploy.sh`,
then `READINESS_DATABASE_URI=<same> pnpm --dir apps/questura/apps/server readiness:stack -- up --build` and
open `http://app.readiness.localhost:3100`.

### The merge rehearsal (2026-09-25)

On that day's real dumps (laptop and Mac, `pg_dump -Fc`, read-only), on
throwaway servers under `/tmp` that were deleted afterwards with the dumps:

- `merge-databases.sh` passed every check on Postgres 16.15 and on 17.11
  (the report above); each merged dump restored with identical row counts.
- The merged dump loaded into an empty Postgres 17.11 with step 6's
  command (`ON_ERROR_STOP`, one transaction) in under a second. Step 7's
  counts: `locations` 31, `articles` 25, `media_assets` 18,671, `media_sets`
  793, `users` 5, `service_accounts` 2, `visitor_profiles` 3,
  `visitor_auth_users` 3, `visitor_auth_accounts` 5, `visitor_auth_sessions`
  3, `visitor_auth_verifications` 9, `bookmarks` 2, `stripe_webhook_events`
  24, `payload_migrations` 47.
- `pre-deploy.sh` (step 8) on it: the guard rated the three newer migrations
  `automatic-safe`, applied them (47 → 50), found nothing pending, and left
  the search index alone (it had rows).
- The API and website (`readiness:stack -- up --build`, Node 22) booted on
  it. `/` redirects to `/peru/lima` as designed and Lima renders (200).
  Article 19 renders with the Mac's author, not the laptop's. Article 32
  renders with the Mac's author **and** the laptop's members-only lock.
  Article 17 is members-only, and free article 19 is not. The API serves the
  Mac's `main_homepage` (one draft block, never published: nothing on the
  site reads it yet). `/api/user/check` finds all 3 of the laptop's readers
  and not a made-up address. `stripe_webhook_events` has 24 rows.

The merge's own test, with a throwaway server:
`MERGE_TEST_SCRATCH=postgres://postgres@127.0.0.1:5471 PG_BINDIR=$PG17 bash apps/questura/apps/server/scripts/cutover/merge-databases.test.sh`
(CI runs only its refusals, through `test:softprod`).

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
