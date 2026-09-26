# H01 — the provisioning checklist

*Written 22 September 2026, for whenever the owner decides to start. Nothing
here has been done.*

This is the click-by-click list for creating the hosted target: Cloudflare
for the frontend, Railway for the backend and Redis, Neon for Postgres. It
exists so that starting is twenty minutes of following steps rather than an
afternoon of reading. **Reading it costs nothing. Doing step 1 starts
spending money.**

Everything below is the owner's to do. Nothing in this repository provisions,
deploys or pays for anything.

## Before you start

Three things are settled and should not be re-litigated at the dashboard:

- **Cloudflare Workers, not Pages.** Pages does not support ISR. A Pages
  project will build, serve, and never refresh (ADR-0014).
- **The first database has to come from a dump.** `pnpm db:migrate` cannot
  build a Questura database from empty — the earliest committed migration
  assumes tables that predate the chain. Step 9 is not optional or
  reorderable.
- **All four Cloudflare cache components are required.** Three of four builds
  and serves and leaves the site permanently stale.

Two things you will need in hand:

- the domain `questurian.com`, with its nameservers movable to Cloudflare;
- a card. Neon and Railway both need one before a production-sized instance.

## Order

The order matters in two places and is otherwise free:

1. Neon before Railway — Railway needs the connection string.
2. Railway before Cloudflare — the Worker needs the backend origin, and both
   need the same revalidation secret.

---

## Part A — Neon (Postgres)

**1. Create the project.**
Console → *New Project*. Name it `questura`. Pick the region you will also
pick for Railway — they must match, or every query pays a cross-region round
trip.

**2. Turn off scale-to-zero on the production branch.**
Branch → *Settings* → *Compute* → disable *Scale to zero*. Railway runs a
long-lived process; a database that suspends underneath it produces cold
starts on the first request after every quiet spell.

**3. Read the real connection limit.**

```sql
SHOW max_connections;
```

Neon ties this to compute size. Write the number down — it becomes
`DATABASE_MAX_CONNECTIONS`, and production refuses to boot if the declared
pools do not fit inside it.

The arithmetic, from `cap07-platform-readiness.md` §2: each process wants 41
connections with default pools (20 Payload + 10 Better Auth + 10 advisory
locks + 1 startup). Four serving instances plus one rollout surge plus one
job process is `6 × 41 + 5 reserve = 251`. If the compute size you want gives
you fewer, shrink the pools instead:

```
DATABASE_POOL_PAYLOAD_MAX=10
DATABASE_POOL_VISITOR_AUTH_MAX=5
DATABASE_POOL_ADVISORY_LOCK_MAX=4
→ 6 × 20 + 5 = 125
```

**4. Take both connection strings.**
Neon offers a pooled and a direct (unpooled) endpoint. Take **both**.

- Use the **direct** endpoint as `DATABASE_URI`. Railway is long-lived, so
  the pooler buys nothing and costs a hop.
- Set `DATABASE_URI_UNPOOLED` to the direct endpoint **as well**, always.

> This is the one that breaks quietly. The payment advisory locks need a
> session-level connection. Behind a transaction pooler they silently stop
> coordinating — no error, no log line, and two webhooks can process the same
> subscription change. If you ever switch `DATABASE_URI` to the pooled
> endpoint, `DATABASE_URI_UNPOOLED` must still be the direct one.

**5. Set the history window to 7 days.** Neon's retention is the
point-in-time recovery tier: the answer to "how far back can we restore".
Decision D7 set it at 7 days (at most 5 minutes lost). The setting, the
read-only backup role and the daily off-Neon copy are in
`docs/procedures/backup-restore-rollback.md`, "One-time setup".

---

## Part B — Railway (backend and Redis)

**6. Create the project and the Postgres-less service.**
New Project → *Empty Project*. Name it `questura`. Then *New* → *GitHub Repo*
→ this repository.

Railway no longer accepts config-as-code (`railway.json`: "deprecated. Use
Infrastructure as Code"), so `infra/railway/railway.json` is only a record of
the values; set them on the service itself. The root is the **repository
root**, so the build uses the root `pnpm-lock.yaml` and its overrides (with the
root at `apps/questura/apps/server`, Railway sees no lockfile and installs
fresh versions; proved on a throwaway service 2026-09-26):

| Setting | Value |
|---|---|
| Root directory | `/` (through the API send `"/"`; `null` is ignored) |
| Build command | `pnpm --dir apps/questura/apps/server run build` |
| Start command | `pnpm --dir apps/questura/apps/server start` |
| Pre-deploy | `bash apps/questura/apps/server/scripts/deploy/pre-deploy.sh`, timeout 900 s (migration guard, then migrations: `docs/procedures/backup-restore-rollback.md`, "Migrations and the deploy guard") |
| Healthcheck | `/api/health/ready`, 120 s; restart on failure, 10 retries |
| Watch paths | `apps/questura/apps/server/**`, `pnpm-lock.yaml` |
| Variables | `RAILPACK_INSTALL_CMD=pnpm install --frozen-lockfile --filter @questura/server...`, `RAILPACK_NODE_VERSION=22` (from the root Railway cannot see `engines.node`) |
| Region | `us-east4-eqdc4a` (Virginia, next to Neon `aws-us-east-1`); set it on **every** service, the project default was Amsterdam |

Connecting the repository through the API made no deployment and no push
trigger: the first deploy is started by hand on moving day.

Do **not** add Railway's own Postgres. The database is Neon.

**7. Add Redis in the same project.**
*New* → *Database* → *Redis*. Same project means the private network, which
is what makes a session check sub-millisecond. Take its private URL as
`REDIS_URL`.

**8. `TRUSTED_PROXY` and the API front door (ADR-0016, option A).**

`TRUSTED_PROXY` has no safe default and production refuses to boot without
it. It names the single header the app believes about a caller's IP. The
owner chose option A in `docs/adr/0016-api-origin-identity-on-railway.md`:
Cloudflare in front of the API, the origin locked by a shared secret.

1. `TRUSTED_PROXY=cloudflare`.
2. Generate `ORIGIN_AUTH_SECRET` (64 random characters, its own value, not
   the render token's). It goes in three places, all the same value:
   Railway (step 10), the Worker (step 17), and the Transform Rule below.
3. DNS: `api.questurian.com` proxied (orange cloud) in the `questurian.com`
   zone, pointing at the target Railway gives for the custom domain. Write
   that target down: on the day, `dig +short <target>` gives the address for
   `launch:verify --edge-ip` (or pass `--origin-edge https://<target>`).
4. Cloudflare → Rules → Transform Rules → *Modify Request Header*: when
   hostname equals `api.questurian.com`, **set** static header
   `X-Questura-Origin-Auth` to the secret. *Set*, not *add*, so a caller's
   own value is replaced.
5. Railway → the service → Networking → Edge rules, in this order: allow
   when header `X-Questura-Origin-Auth` equals the secret; then block
   `Path matches *`. Not "block when header is not the secret": a negative
   match against a missing header does not match, so it would let every
   request without the header through. If the plan has no edge-rule
   allowance, the app's own check (below) is the lock; say so in the PL1
   write-up.
6. Delete the generated `*.up.railway.app` domain. Not the lock, one less door.

The app checks the header itself (`src/shared/http/origin-auth.ts`): a
request without it gets 403, except `/api/health` and `/api/health/ready`,
which Railway's healthcheck calls on the container directly. Stripe
webhooks, Google's sign-in redirect, the writer pipeline, Location Manager
and the admin panel all arrive through Cloudflare and carry it. A scheduler
must call `https://api.questurian.com/...`, not Railway's private network.

Do not guess, and do not set anything permissive to get past the boot check.
Rotating the secret: set the new value in the Transform Rule and on the
Worker and Railway together; in between, requests with the old value are
refused.

**9. Load the database — from a dump, not from migrations.**

This is moving day, and it has its own runbook with the exact commands, the
order, the counts to compare and the owner steps:
`docs/procedures/cutover.md` (steps 4 to 8). In short: park the laptop, dump
it, restore into Neon with a Postgres **17** client
(`psql -v ON_ERROR_STOP=1 --single-transaction`), compare counts, and let the
first deploy's pre-deploy step bring it forward with `pnpm db:migrate`.

Running `db:migrate` against an empty Neon database fails in the first
migration. That is not a bug to work around at 2am; it is a known property of
the committed chain, and it is why `readiness copy-from` exists.

**10. Set the environment.**

The full list, with every optional variable, is
`infra/railway/server.env.template`. Fill a copy, never commit it, and check
it before the first deploy:

```bash
pnpm --dir apps/questura/apps/server env:check path/to/filled.env
```

It runs the production boot check against that file alone, and it also
refuses leftover placeholders, test-mode Stripe keys, loopback database or
Redis hosts, sandbox variables, and one secret reused in two roles.

Required. Boot refuses without these:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | the site origin |
| `BACKEND_URL_LOCAL` | the API's own public origin (same registrable domain as the site) |
| `DATABASE_URI` | Neon direct endpoint |
| `DATABASE_URI_UNPOOLED` | Neon direct endpoint (see step 4) |
| `DATABASE_MAX_CONNECTIONS` | the number from step 3 |
| `APP_PROCESS_COUNT` | the autoscale cap you set on the service |
| `APP_ROLLOUT_SURGE` | extra instances alive during a deploy (1 is fine) |
| `TRUSTED_PROXY` | from step 8 |
| `ORIGIN_AUTH_SECRET` | from step 8 (env:check requires it; boot requires 32+ chars when set) |
| `REDIS_URL` | Railway Redis private URL |
| `QUESTURA_CLIENT_URL` | the frontend origin, where publications are delivered |
| `QUESTURA_REVALIDATION_SECRET` | generate one now; Cloudflare gets the same value in step 16 |
| `PAYLOAD_SECRET` | a fresh 64-character secret, not the laptop's. It signs staff out once and turns off every service-account key until re-issued (`docs/procedures/cutover.md`) |
| `BETTER_AUTH_SECRET` | a fresh one, not `PAYLOAD_SECRET`. It signs every reader out once (`docs/procedures/cutover.md`) |
| `PAYLOAD_COOKIE_DOMAIN` | step 11 |
| `PAYLOAD_COOKIE_REQUIRED_HOSTS` | step 11 |
| `STRIPE_SECRET_KEY` | live restricted key |
| `STRIPE_WEBHOOK_SECRET` | signing secret of the endpoint for this host |
| `STRIPE_PRICE_ID_MONTHLY` | the catalog monthly price |

Worth setting at the same time:

| Variable | Why |
|---|---|
| `QUESTURA_RENDER_TOKEN` | gives frontend renders their own read budget. 32+ chars. Also goes to Cloudflare. |
| `REFRESH_WORKER_SECRET` | protects `POST /api/internal/refresh-jobs` |
| `DB_STATS_SECRET` | protects `/api/internal/db-stats` |
| `EXCHANGE_RATE_SYNC_SECRET` | protects the daily rates sync |
| `QUESTURA_INSTANCE_ID` | a stable per-instance identity, so per-process evidence can be read |

**11. Cookies need the parent domain.**
The frontend and the API must both sit under `questurian.com` — for example
`questurian.com` and `api.questurian.com`. A `*.up.railway.app` or
`*.workers.dev` host cannot carry the session cookie, and `session-cookie.ts`
rejects all three as a cookie domain. Set `PAYLOAD_COOKIE_DOMAIN` and
`PAYLOAD_COOKIE_REQUIRED_HOSTS` accordingly.

---

## Part C — Cloudflare (frontend)

**12. Add the zone.**
Add `questurian.com` to Cloudflare and move the nameservers. Copy the **zone
id** from the overview page — the cache-purge token needs it.

**13. Create the R2 bucket.**
R2 → *Create bucket* → name it exactly `questura-incremental-cache`. That
name is already in `wrangler.jsonc`; changing it means editing that file too.

**14. Create the D1 database.**

```bash
pnpm exec wrangler d1 create questura-tag-cache
```

It prints a `database_id`. Paste it into `wrangler.jsonc`, replacing the
zeroed placeholder. This is the one value in that file that is currently
fake.

**15. The two Durable Objects create themselves.**
`DOQueueHandler` and `BucketCachePurge` are declared in `wrangler.jsonc` with
a `v1` migration. The first `wrangler deploy` creates them. Nothing to click.

**16. Create the cache-purge API token.**
My Profile → *API Tokens* → *Create Token* → *Custom token*.

- Permissions: **Zone → Cache Purge → Purge**. That one line, nothing else.
- Zone Resources: include → the `questurian.com` zone only.

A token with broader permissions works exactly as well and is the difference
between a leaked token purging a cache and a leaked token editing DNS.

**17. Set the secrets.**

```bash
cd apps/questura/apps/client
pnpm exec wrangler secret put QUESTURA_REVALIDATION_SECRET   # same value as step 10
pnpm exec wrangler secret put QUESTURA_RENDER_TOKEN          # same value as step 10
pnpm exec wrangler secret put ORIGIN_AUTH_SECRET             # same value as step 8
pnpm exec wrangler secret put CLOUDFLARE_API_TOKEN           # from step 16
pnpm exec wrangler secret put CLOUDFLARE_ZONE_ID             # from step 12
```

`QUESTURA_RENDER_TOKEN` and `ORIGIN_AUTH_SECRET` are server-only. Neither may
ever appear as `NEXT_PUBLIC_` anything: a render token in a browser bundle is
a published bypass of the per-IP read limits, and the origin secret in one is
a published key to the origin. Without `ORIGIN_AUTH_SECRET` on the Worker,
every page that needs the API fails to render once the lock is on.

**18. Gather the site's build settings.**
`NEXT_PUBLIC_*` values are written into the site's JavaScript when it is
built. Setting them later (a `wrangler.jsonc` var, the Cloudflare dashboard)
changes nothing. `vars.NEXT_PUBLIC_BACKEND_URL` in `wrangler.jsonc` is the
local-preview value and does not choose the API a deployed site calls.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | the API origin, e.g. `https://api.questurian.com` |
| `NEXT_PUBLIC_APP_URL` | the site origin, e.g. `https://www.questurian.com` |
| `NEXT_PUBLIC_FRONTEND_URL` | the same site origin |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | the live publishable key, `pk_live_…` |
| `NEXT_PUBLIC_IMAGE_CDN_ORIGIN` | the Bunny pull zone origin, e.g. `https://questurian-cdn.b-cdn.net` (optional: a preconnect hint) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | the browser Maps key (optional: maps stay blank without it) |
| `NEXT_PUBLIC_ENDORSELY_ENABLED`, `NEXT_PUBLIC_ENDORSELY_ORG_ID` | only if affiliate tracking is on |

The build refuses to start if the first four are missing, not `https`, point
at this computer, or the key is not `pk_live_`. The message names the
variable.

**19. Build — in a worktree, not the working copy, with the settings above.**

```bash
git worktree add /tmp/questura-build origin/main
cd /tmp/questura-build/apps/questura && pnpm install
cd apps/client
NEXT_PUBLIC_BACKEND_URL=https://api.questurian.com \
NEXT_PUBLIC_APP_URL=https://www.questurian.com \
NEXT_PUBLIC_FRONTEND_URL=https://www.questurian.com \
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_… \
  pnpm exec opennextjs-cloudflare build
pnpm scan:bundle   # expect: no localhost or loopback addresses in .next/static, .open-next/assets
```

The worktree has no `.env` files, which is the point: everything the site
bakes in is on that command line and nowhere else. The build itself scans
`.next/static` for `localhost` and `127.0.0.1` when it finishes; `pnpm
scan:bundle` checks `.open-next/assets`, which is what gets uploaded. Either
failing means: do not deploy.

If `pnpm dev` is running, building in the working copy fails with
`Could not resolve "../../chunks/ssr/[turbopack]_runtime.js"` — an error that
says nothing about its cause. The dev server writes turbopack artifacts into
`.next`, the adapter bundles from `.next`, and it ignores `NEXT_DIST_DIR`.

`wrangler.jsonc` sets `workers_dev: false` and `preview_urls: false`: the site
is served only on its own domain, never as a crawlable `*.workers.dev` copy.

**20. Deploy.** `pnpm exec opennextjs-cloudflare deploy`. This is the first
irreversible step in Part C.

---

## Before calling it done

Four checks, in this order. Each one catches a failure that otherwise looks
like success.

**A. Does a publication reach the frontend at all?**
Edit an article in the admin, save it, and watch the `refresh_jobs` table
drain to `done`. If rows sit in `failed` with a 401, the two
`QUESTURA_REVALIDATION_SECRET` values do not match.

**B. Does the page actually change?**
Load the published page, note the content, publish a change, load again in a
fresh browser. A drained queue is not evidence — the whole point of the four
cache components is that the queue can drain perfectly while the CDN serves
the old page.

**C. Does the purge reach the edge?**
Check from a second network — a phone on cellular is enough. A purge that
works in your browser and not on a phone is cache purge not wired, which is
the specific failure mode of declaring `NEXT_CACHE_DO_PURGE` without the
`cachePurge` override in `open-next.config.ts`.

**D. Do the advisory locks still coordinate?**
`/api/internal/db-stats` should show the advisory-lock pool connected on a
direct endpoint. This is the `DATABASE_URI_UNPOOLED` check, and it has no
symptom until two payment webhooks arrive at once.

## What this checklist does not cover

Provisioning is H01. It is the first of six hosted gates, and the other five
— ingress and cookies, cache semantics, fleet and job envelope, recovery and
payment readiness, and a capacity run with a spend cap — all still need the
owner's budget, instance cap, campaign URLs and recovery targets. None of
those numbers exist yet.

Having done everything here means the target exists. It does not mean the
site is ready for traffic.
