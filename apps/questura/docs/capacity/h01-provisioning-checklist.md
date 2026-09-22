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

**5. Note the history window.** Neon's retention is the point-in-time
recovery tier. It is the answer to "how far back can we restore", which is
the D6 recovery target nobody has set yet.

---

## Part B — Railway (backend and Redis)

**6. Create the project and the Postgres-less service.**
New Project → *Empty Project*. Name it `questura`. Then *New* → *GitHub Repo*
→ this repository. Set the service root to `apps/questura/apps/server`.

Do **not** add Railway's own Postgres. The database is Neon.

**7. Add Redis in the same project.**
*New* → *Database* → *Redis*. Same project means the private network, which
is what makes a session check sub-millisecond. Take its private URL as
`REDIS_URL`.

**8. Decide `TRUSTED_PROXY` before deploying anything.**

This one has no safe default and production refuses to boot without it. It
names the single header the app will believe about a caller's IP. Get it
wrong and every rate limit either applies to the whole internet as one
caller, or can be bypassed with a forged header.

Railway's forwarded-IP behaviour is documented on community forums, not in
Railway's own docs. So there are two acceptable routes:

- **Recommended:** put Cloudflare in front of the API hostname, set
  `TRUSTED_PROXY=cloudflare`, and make the `*.up.railway.app` origin
  unreachable from outside. Then the header is one Cloudflare sets and
  Cloudflare's docs describe.
- Or confirm Railway's header from official documentation and add it to
  `trusted-proxy.ts` the way that file requires.

Do not guess, and do not set it to something permissive to get past the boot
check.

**9. Load the database — from a dump, not from migrations.**

```bash
# from a machine that can reach both
pg_dump -h <source-host> -d <source-db> --no-owner --no-privileges > questura.sql
psql "<neon-direct-connection-string>" -v ON_ERROR_STOP=1 -f questura.sql
```

Then, and only then, `pnpm db:migrate` to bring it forward.

Running `db:migrate` against an empty Neon database fails in the first
migration. That is not a bug to work around at 2am; it is a known property of
the committed chain, and it is why `readiness copy-from` exists.

**10. Set the environment.**

Required — boot refuses without these:

| Variable | Value |
|---|---|
| `DATABASE_URI` | Neon direct endpoint |
| `DATABASE_URI_UNPOOLED` | Neon direct endpoint (see step 4) |
| `DATABASE_MAX_CONNECTIONS` | the number from step 3 |
| `APP_PROCESS_COUNT` | the autoscale cap you set on the service |
| `APP_ROLLOUT_SURGE` | extra instances alive during a deploy (1 is fine) |
| `TRUSTED_PROXY` | from step 8 |
| `REDIS_URL` | Railway Redis private URL |
| `QUESTURA_CLIENT_URL` | the frontend origin — where publications are delivered |
| `QUESTURA_REVALIDATION_SECRET` | generate one now; Cloudflare gets the same value in step 16 |
| `PAYLOAD_SECRET` | a fresh 64-character secret, not the laptop's |
| `BETTER_AUTH_SECRET` | a fresh one |

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
already rejects two of those outright. Set `COOKIE_DOMAIN` and
`REQUIRED_HOSTS` accordingly.

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
pnpm exec wrangler secret put CLOUDFLARE_API_TOKEN           # from step 16
pnpm exec wrangler secret put CLOUDFLARE_ZONE_ID             # from step 12
```

`QUESTURA_RENDER_TOKEN` is server-only. It must never appear as
`NEXT_PUBLIC_` anything — a render token in a browser bundle is a published
bypass of the per-IP read limits.

**18. Point `NEXT_PUBLIC_BACKEND_URL` at the real backend.**
In `wrangler.jsonc`, `vars.NEXT_PUBLIC_BACKEND_URL` is still
`http://127.0.0.1:4100` from local preview. It becomes the Railway API
origin.

**19. Build — in a worktree, not the working copy.**

```bash
git worktree add /tmp/questura-build HEAD
cd /tmp/questura-build/apps/questura && pnpm install
cd apps/client && pnpm exec opennextjs-cloudflare build
```

If `pnpm dev` is running, building in the working copy fails with
`Could not resolve "../../chunks/ssr/[turbopack]_runtime.js"` — an error that
says nothing about its cause. The dev server writes turbopack artifacts into
`.next`, the adapter bundles from `.next`, and it ignores `NEXT_DIST_DIR`.

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
