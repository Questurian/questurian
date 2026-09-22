# Campaign capacity: status

Execution contract: [`../campaign-capacity-implementation.md`](../campaign-capacity-implementation.md).
Scenarios and rationale: [`../campaign-capacity-plan-2026-09-21.html`](../campaign-capacity-plan-2026-09-21.html).
How to measure: [`README.md`](README.md).

> **Before the parked laptop's next deploy:** add these three lines to
> `~/questura/config/server.env`, or the new release refuses to boot and the
> healthcheck fails (details: `infra/softprod/README.md`, "connection budget"):
>
> ```
> DATABASE_MAX_CONNECTIONS=100
> APP_PROCESS_COUNT=1
> APP_ROLLOUT_SURGE=0
> ```
>
> Check the real limit first with `SHOW max_connections`. The deploy script
> already runs the CAP-06 migration.

> **Intended platform (owner, 2026-09-21):** frontend on Cloudflare (**not
> Vercel**), backend on Railway, Postgres on Neon, Redis on Railway. Not
> provisioned. What it changes: `cap07-platform-readiness.md` §1a, ADR-0014.

Statuses: planned · in progress · implemented locally · verified on target · blocked · verified existing.
**Nothing below is "verified on target".** Every number is from a Mac, a local
production build and the local dataset (25 articles, 18 published; 5 authors;
31 locations; 12 homepages, 3 published city pages with blocks). Local numbers
find bottlenecks and price the code; they do not say what a platform can carry.

| Ticket | Status | Evidence |
|---|---|---|
| CAP-01 Baseline and harness | implemented locally | this file, `runs/2026-09-21-cap01-*` |
| CAP-02 Connection budget and overload | implemented locally | `runs/2026-09-21-cap02-*` |
| CAP-03 Anonymous identity | implemented locally (valid-session path proven by tests + source, not measured) | `runs/2026-09-21-cap03-*` |
| CAP-04 Cache correctness, route coverage | implemented locally; shared-CDN proof owed to CAP-07/08 | `public-surface.md`, `runs/2026-09-21-cap04-*` |
| CAP-05 Cold query amplification | implemented locally | `runs/2026-09-21-cap05-*` |
| CAP-06 Durable refresh, safe startup | implemented locally; platform scheduler owed to CAP-07 | `pnpm verify:refresh-outbox` |
| CAP-07 Platform, recovery, cost | blocked: stack chosen in principle (§1a); D3–D6 open; nothing provisioned | `cap07-platform-readiness.md` |
| CAP-08 Capacity proof | blocked: needs CAP-07 target; scripts ready, and their gates now proven able to fail (L13) | `cap08-proof-matrix.md`, `load/k6/` |

## Local readiness series (L00–L15), 2026-09-22

Sixteen tasks from [`local-readiness-plan.html`](local-readiness-plan.html),
implemented and merged. Full state, evidence and what is still owed:
[`local-readiness-handoff.md`](local-readiness-handoff.md).

| Task | Status | Evidence |
|---|---|---|
| L00 disposable sandbox | implemented locally | `runs/readiness-sandbox.json` |
| L01 publication atomicity | implemented locally | `runs/2026-09-22-L05-publish-end-to-end.md` |
| L02 worker fencing (+ migration) | implemented locally | `runs/2026-09-22-L02-worker-fencing.md` |
| L03 bounded fan-out | implemented locally; large-corpus memory not measured | unit tests |
| L04 worker lifecycle and readiness | implemented locally | `runs/2026-09-22-L14-readiness-baseline.md` |
| L05 publish chain end to end | implemented locally; **frontend page cache owed** | `runs/2026-09-22-L05-publish-end-to-end.md` |
| L06 mount bounds, anonymous GraphQL closed | implemented locally | `runs/2026-09-22-L14-readiness-baseline.md` |
| L07 ingress stage, Redis breaker, private budget | implemented locally | same |
| L08 cache freshness contract | implemented locally; full-route limit is H03 | `cache-contract.md` |
| L09 Cloudflare adapter | **blocked on tooling** (dependency not approved) | `../../apps/client/cloudflare/README.md` |
| L10 fleet contract | implemented locally | `pnpm test:int` |
| L11 per-instance evidence | implemented locally | `runs/2026-09-22-L14-readiness-baseline.md` |
| L12 multi-process rehearsal | implemented locally; **serving-process half owed** | `runs/2026-09-22-L12-fleet-rehearsal.md` |
| L13 proof gates that can fail | implemented locally | `runs/2026-09-22-L13-negative-controls.md` |
| L14 local baseline | implemented locally; corpus is 25 articles | `runs/2026-09-22-L14-readiness-baseline.md` |
| L15 restore and handoff | implemented locally | `pnpm readiness:restore` 10/10 |

**Still not "verified on target".** Every number above is from a Mac.

Four findings worth reading even if nothing else is:

1. `pnpm db:migrate` **cannot build a Questura database from empty** — the
   first database in any new hosted environment has to come from a dump.
2. The fencing migration's rollout must **stop the drains** during the
   old/new overlap, or an old-release worker can still finish a new worker's
   claim.
3. CI did not run a production build, and a build-breaking change passed
   tests, typecheck and lint. A build job now runs.
4. All four OpenNext cache components are required, not optional; without the
   tag cache and cache purge, publishing drains clean and the site stays
   stale.

Starting SHA: `d948bcfb` (main, 2026-09-21).

## Environment used

- Mac, Node v24.15.0, Next 15.4.11, Payload 3.79.1.
- Server: production build in `.next-capacity`, `next start -p 4100`, env from
  `scripts/measure/local-prod-env.sh` (placeholder URLs, placeholder Stripe
  values, local Redis on 6390, `PUBLIC_API_DIAGNOSTICS=1`). Read-only use.
- Database: local Postgres `google-login` on 5432 (the working dataset).
- The developer's `pnpm dev` on 3000/4000 was left running and untouched.
- Load generator: the Node harness on the same machine. Generator lateness p95
  stayed under 2 ms in every run below, so the generator was not the limit.
- Tools installed with approval (2026-09-21): `redis`, `k6` (Homebrew).

## CAP-01 — harness and baseline

**Problem.** `measure-public-api.ts` put every status into one latency
distribution, dropped exactly one sample as "cold" even for concurrent
batches, had no deadline, coerced bad flags to `NaN` (zero runs, silent), and
could only model callers who wait for each other.

**Changed.**
- `apps/server/scripts/measure-public-api.ts` — thin CLI.
- `apps/server/scripts/measure/{args,scenario,sample,stats,run,report,pool-sampler}.ts`
  — validated flags; one outcome per response (`ok`, `throttled`,
  `client-error`, `server-error`, `invalid-body`, `timeout`, `transport`);
  latency over `ok` only; labelled warmup; deadline covering the body;
  closed and arrival modes; dropped arrivals counted; trailing-window abort;
  JSON/HTML evidence with SHA and workload metadata; optional pool sampling.
- `apps/server/scripts/measure/scenarios/*.json` — `public-api`,
  `cold-content`, `identity`, `hot-pages`, `campaign-reader`,
  `heavy-homepage`; each step states what correct content looks like.
- `apps/server/src/shared/observability/request-report.ts` — `Server-Timing`
  now carries `pool;dur=…;desc="N acquires"`: time spent in `pool.connect()`.
  A floor, not the full wait (a bare `pool.query` acquires internally and its
  wait lands in `sql`).
- `apps/server/vitest.config.ts` registers `scripts/measure/**/*.test.ts`.
- `apps/server/next.config.mjs` — `distDir` from `NEXT_DIST_DIR`, so a
  measurement build never overwrites a running dev server's `.next`.

**Tests.** `scripts/measure/harness.test.ts` (25): fast 429/500 cannot lower
the ok p95; every warmup excluded; hung fetch and stalled body time out;
refused connection is `transport`; bad `--runs`/`--concurrent` fail with the
flag named; arrival mode drops rather than delays; trailing-window abort.
`request-report.test.ts` gains pool-wait coverage.

**Baseline** (`runs/2026-09-21-cap01-*.json`):

| Run | Result |
|---|---|
| `public-api` warm, sequential, 20 runs | Lima city page p50 298 / p95 402 ms, **382 statements, 43 reads**. Search p95 105 ms (26 stmts). Feed p95 54 ms (28). Index 35 ms (9). Author 27 ms (22). Identity 3 ms. 0 failures. |
| `cold-content`, first request per URL | Lima page 377 ms; others 6–51 ms. *Correction (found in CAP-03): the restart helper did not reliably kill the renamed `next-server` process, so this may have run on an already-warm process. Treat as first-request-per-URL, not a fresh process.* |
| `identity` arrival 50/s, 20 s | 1,000/1,000 ok, p95 7 ms for absent, malformed and unknown cookies. No `Server-Timing` on `/api/me`, so its SQL/Redis cost is **unavailable** (CAP-03). |
| `heavy-homepage` closed sweep (coalescing skipped) | c=1 253 ms · c=2 454 · c=4 860 · c=8 1,660 · c=16 3,311 ms p50. **Throughput flat at ~4–5 assemblies/s**; latency is queueing. Pool (20) full from c=4; 86 waiting at c=16. |
| `heavy-homepage` arrival | 2/s and 4/s healthy (p95 285 / 308 ms). **6/s: p50 8.1 s, p95 10.9 s, 296 waiting for the pool.** No bound, no shedding: the queue grows until requests time out. |

**Findings the baseline surfaced** (each assigned to a ticket):

1. *Boot refusal does not refuse* (CAP-02). With an invalid production
   config, `assertProductionConfig` throws inside Payload's `onInit`;
   `instrumentation.ts` catches it, logs "Database connection failed", and
   the process serves traffic anyway. Observed: `/api/public/locations/menu`
   answered 200 after "Refusing to boot". Every boot-required setting
   (`TRUSTED_PROXY`, cookie domain, the pool budget) is therefore advisory.
2. *Coalescing bypass in production* (CAP-02). The Lima route skips
   coalescing whenever `x-questura-read-limit` is present; only the budget
   override itself is refused in production. Any caller can force one full
   assembly per request.
3. *Unbounded queue past ~4 heavy assemblies/s per process* (CAP-02).
4. *Wrapper gaps* (CAP-04): `articles/by-canonical-path`, `sitemap-entries`,
   `locations/menu`, `countries/*/cities` return no `Server-Timing`, i.e. no
   counting, no shared rate limit, no shared cache headers.
5. *One rate-limit bucket for everyone behind one IP* (CAP-04). Local runs
   share one key; the 121st Lima request in a minute was throttled. A
   frontend server rendering for many readers presents one IP.
6. *`/api/me` cost is unmeasured* (CAP-03).

**Harness limits.** One Node process; lateness is reported and was < 2 ms
here. Cookie-bearing API calls need `--origin` set to an allowed origin
(the server returns 403 otherwise). Server typecheck has one pre-existing
error in `vitest.config.ts` (vite 5/7 plugin types), present on main.

**Rollback.** Revert the PR; the old script had no dependents.

## CAP-02 — connection budget and overload boundaries

**Problem (revalidated).** `pool-budget.ts` skipped the check when
`DATABASE_MAX_CONNECTIONS` was unset (0) and defaulted the process count to 1;
Payload's pool size was hardcoded separately in `payload.config.ts` (and
Better Auth's, the lock pool's and the boot guard's in three more files).
Nothing counted rollout overlap, scheduled jobs, an operator reserve, or the
difference between pooler clients and real backends. Nothing bounded how many
page assemblies ran at once. And (CAP-01 finding 1) a production boot
refusal was logged and ignored.

**Changed.**
- `shared/database/pool-budget.ts` — the one source of pool sizes
  (`poolSizes()`, env overrides `DATABASE_POOL_*_MAX`, never `NaN`) used by
  `payload.config.ts`, `better-auth.ts`, `advisory-lock.ts` and
  `ensure-visitor-auth-schema.ts`. Budget = (serving + rollout surge + jobs)
  × per-process + reserve. Direct topology: all against
  `DATABASE_MAX_CONNECTIONS`. Pooled topology: pooled pools against
  `DATABASE_POOLER_MAX_CLIENTS`; pooler backends + direct lock pools + reserve
  against `DATABASE_MAX_CONNECTIONS`. Production requires
  `DATABASE_MAX_CONNECTIONS`, `APP_PROCESS_COUNT`, `APP_ROLLOUT_SURGE` (and the
  two pooler values when pooled); every value is a bounded integer.
- `shared/config/boot-guard.ts` + `instrumentation.ts` — config problems are
  checked first, outside the catch, and the process exits 1.
- `shared/http/admission.ts` — per-process gates. `assembly` (curated pages):
  2 running, 8 queued, 1.5 s max wait. `query` (search, feeds, index,
  author): 8 / 32 / 1.5 s. Refusal = 503, `Retry-After: 1`, `no-store`,
  `X-Questura-Overload`. Waiters leave on abort; slots released in `finally`.
  `publicRead` gates query scopes; the city page gates its *coalesced* work so
  joiners take no slot. `/api/internal/db-stats` reports gate stats.
- City page route: coalescing is skipped only when the read-budget override
  is actually honoured (dev, or production with `PUBLIC_API_DIAGNOSTICS=1`).
- Docs: launch checklist 4a, softprod README (laptop `server.env` needs the
  three budget keys before the next deploy).

**Why these gate sizes.** CAP-01 sweep: Lima throughput is flat (~4–5/s) from
concurrency 1 to 16; pool full at 4; c=2 has the same throughput at half the
latency of c=4 and leaves 8 of 20 Payload connections for everything else.
They are env overrides and must be re-measured on the target platform.

**Tests.** `pool-budget.test.ts` (omitted/invalid values, exact allowance
boundary, multiple instances, rollout surge, pooled vs direct, smaller
per-instance pools); `assert-production-config.test.ts`; `boot-guard.test.ts`;
`admission.test.ts` (limit, queue-full, queue timeout, abort while waiting,
throw/reject cannot leak, burst drains); `public-read.test.ts` (503 shape,
coalesced routes not gated at the wrapper); override-header tests. Full suite
1458 passed.

**Measured** (local prod build, `heavy-homepage`, coalescing skipped):

| Arrivals | Before (CAP-01) | After |
|---|---|---|
| 4/s | p95 308 ms, 0 failures | p95 251 ms, 0 failures |
| 6/s | p50 8.1 s, p95 10.9 s, 296 waiting for the pool | p50 1.7 s, p95 1.96 s, p99 2.48 s; 20 refused (503, queue timeout); 5.0 ok/s; pool waiting 0 |
| 10/s | — | 61 ok (3.1/s), 58 refused (503), 81 throttled (per-IP limit, one bucket locally); pool waiting 0; queue empty afterwards |

Boot refusal verified: production start with `APP_ROLLOUT_SURGE` unset
logged the problem and exited 1; nothing listened on the port.
`public-api` regression unchanged (city page 382 statements / 43 reads).

**Config requirement.** Every production environment (laptop included) must
set `DATABASE_MAX_CONNECTIONS`, `APP_PROCESS_COUNT`, `APP_ROLLOUT_SURGE`
before deploying this, or it will not start.

**Rollback.** Revert the PR. To loosen the gate without a deploy, raise
`PUBLIC_ASSEMBLY_CONCURRENCY` / `_QUEUE` / `_QUEUE_MS` (and `PUBLIC_QUERY_*`)
and restart. Do not raise pool sizes to pass a load test.

**Remaining risks.** The gate is per process: its total bound relies on
`APP_PROCESS_COUNT` being a real autoscaling cap on the platform. Admitted
requests whose client left still run to completion (statement timeouts bound
them). Refusals are 503s the frontend must survive without caching — CAP-04.

## CAP-03 — anonymous identity and request amplification

**Measured first.** `/api/me` now reports `Server-Timing` (statements on the
Better Auth and Payload pools, pool acquires, Redis calls) when diagnostics
are on.

| Caller | Before | Result |
|---|---|---|
| No cookie | unmeasured | **0 statements, 0 pool acquires, 0 Redis calls** |
| Malformed / forged cookie | unmeasured | **0 / 0 / 0** — Better Auth verifies the cookie signature before any lookup (`getSignedCookie` → `null`) |
| Identity at 50 / 200 / 500 per s (mix above, one process) | 50/s only | 0 failures; p99 10.5 / 5.5 / 5.4 ms |
| Valid session | — | not measured: creating a synthetic visitor in the local DB was refused by the session's permission policy. Proven structurally instead (below). |

So the anonymous path was already cheap: **"verified existing"** for the
no-cookie shortcut. No server shortcut and no client session hint were
added — neither would remove work that exists.

**Real waste found and removed.** For a signed-in visitor, `/api/me`
called `listUserAccounts({ headers })` to learn the sign-in methods. That
endpoint runs Better Auth's session middleware (`use: [sessionMiddleware]`,
`better-auth/dist/api/routes/account.mjs`), i.e. a **second session
lookup** per signed-in page view (a Redis read in production), before the
accounts query. `current-principal.ts` now calls
`internalAdapter.findAccounts(userId)` with the id the first lookup produced,
and runs it in parallel with the profile read. Session lookups per signed-in
`/api/me`: 2 → 1. Tests pin it (`getSession` called once, `listUserAccounts`
never).

**Also.**
- Redis client deadlines (`redis-secondary-storage.ts`): `commandTimeout`
  1 s, `connectTimeout` 3 s, capped jittered reconnect backoff
  (`REDIS_COMMAND_TIMEOUT_MS`, `REDIS_CONNECT_TIMEOUT_MS`). Every session
  check and rate limit rides on this client, which previously waited on a
  command for as long as the connection lived. Fail-open/closed policies are
  unchanged: they now trigger after a deadline instead of never.
- **Bug fixed:** the pool counting wrapper (since #613) treated
  `pool.connect(callback)` — how pg-pool's own `query()` acquires — as a
  promise and threw an unhandled rejection on every `pool.query` against a
  counted pool (seen in the prod-build log from `/api/internal/db-stats`).
- Restart helper for local measurement now kills by port.

**Real-browser check** (dev client on :3000, anonymous): landing on
`/peru/lima` made **1** `/api/me`; client-navigating to an article made
**0** more (React Query cache). The article page also made
`/api/account/bookmarks/refs` (0 SQL for an anonymous caller, same signature
short-circuit). A full page load elsewhere repeats both.

**Deferred, with reason.** Skipping `bookmarks/refs` for anonymous readers
would need page content to see the identity answer, which ADR-0003 keeps out
of React Query on purpose (page content is outside `QueryProvider`), and the
reader's session cookie is HttpOnly (must not be read from JS). It costs no
database work; it does cost one function invocation per article page load
on a serverless platform. Revisit if CAP-07 pricing shows invocations
matter.

**Live evidence still owed.** Cookie behaviour, OAuth, expiry and cross-tab
sign-out are unchanged in code but were not exercised; they need the live
environment under project rules.

**Rollback.** Revert the PR. Redis deadlines can be loosened by env.

## CAP-04 — cache correctness and public-route coverage

Full inventory and before/after: [`public-surface.md`](public-surface.md).

**Changed.**
- Eight unwrapped `/api/public/*` routes and the neighbourhood homepage now go
  through `publicRead` (limit, gate, counting, cache headers). The
  neighbourhood page also coalesces and uses the assembly gate. New scopes:
  `articleRead` 240, `navigation` 240 (no gate), `sitemap` 30, `related` 120,
  `payloadApi` 120.
- **Payload REST/GraphQL anonymous bounds** (`shared/payload/anonymous-api-bounds.ts`):
  per-IP limit, `limit ≤ 100`, `depth ≤ 2`, pagination forced. Measured:
  `/api/locations?limit=1000&depth=10` went from **271 MB / 1.3 s** to
  37.7 KB / 37 ms; `pagination=false` no longer returns every row. Staff,
  service accounts and the Local API untouched.
- **Missing vs failed.** `shared/lib/not-found-error.ts`; the five curated
  repositories plus author/editorial resolvers omit only not-found. Client:
  `readPublicResponse` (404 → null, anything else throws) for city and
  neighbourhood homepages, location lists and the sitemap. Before, a backend
  503 rendered Lima as its fallback list or a 404 and ISR cached it for an
  hour; the sitemap collapsed to one URL.
- **Last good output.** Next 15.4 rebuilds blocking after tag/path
  invalidation. Curated pages fall back to the last good answer this process
  saw (`lib/cache/lastGood.ts`, ≤ 7 days, 500 URLs); articles fail loudly.
- **Render bucket.** Optional `QUESTURA_RENDER_TOKEN` gives frontend renders
  their own bounded bucket (20× per-IP) instead of every reader sharing the
  frontend's IP. Sent from `publicFetchOptions`, the location list fetch, the
  menu and static params. Production refuses a token under 32 characters.
- **Bounded staleness.** Client `expireTime` 7 days: HTML
  `stale-while-revalidate` 1 year → 7 days.
- **Prewarm.** `pnpm prewarm:campaign -- --client <origin> --urls docs/capacity/campaign-urls.txt`
  renders each URL once (≤ 8 at a time), then reports whether the cache
  answered. Exit 2 if any failed.
- Client `distDir` from `NEXT_DIST_DIR` (measurement builds beside dev).

**Verified locally** (client and server production builds, `next start`):

| Check | Result |
|---|---|
| UTM / fbclid variants | ISR HIT |
| Visitor cookie on the request | HIT, same HTML, nothing personal |
| RSC variant | separate, HIT |
| Backend 503 + tag invalidation, curated page | 200 from last good (logged), 259 KB, correct content |
| Same, article | 500 (not cached), 200 again once the backend recovered |
| Before the last-good change | tag or path invalidation during a 503 → 500 on every request until recovery |
| Hot pages 50 / 100 / 250 per s, one client process | 0 failures; p99 16 / 11 / 45 ms |
| `campaign-reader` 35 visits/s for 60 s (≈ 6,300 modelled readers; 2 pages + identity each) | 8,400 requests, **0 failures**, pages p99 ≤ 23 ms, identity p99 7 ms, 0 SQL; pool waiting 0 |

The `campaign-reader` numbers describe one Mac serving cached pages from one
process each, over loopback, with no images or JS. They show the code path
holds; they are not the platform's capacity. (Its "page: city" row mixes
three cities under one step name.)

**Tests.** Server: `not-found-error.test.ts` (5 repositories × deleted vs
failed), `anonymous-api-bounds.test.ts`, render-bucket tests, publicRead scope
tests. Client: `readPublicResponse.test.mjs`, `lastGood.test.mjs` (179 pass).

**Owed to CAP-07/08.** Target CDN honours tag purges; ignores tracking params;
never caches `Set-Cookie`; is not a shared cache in front of the backend for
render traffic; real proxy chain for the render bucket. Per-collection
decision on anonymous REST access (listed in `public-surface.md`).

**Config.** Optional `QUESTURA_RENDER_TOKEN` on both apps.

**Rollback.** Revert the PR. Loosen the REST clamp by editing the two
constants; the render bucket is off when the token is unset.

## CAP-05 — cold query amplification

**Changed.**
- `reference-grid/page-read-budget.ts`: `DocumentReadSpec`,
  `readDocumentBySpec` (the single read) and `prefetchDocuments` (one
  `find({ id: { in } })` per block and collection, seeding the request cache
  the single reads then hit). Same collection, `depth`, `select`, `populate`,
  normalisation and cache key by construction: both paths use one spec.
  Missing from the batch = not-found (`null`); a failed batch seeds nothing
  and each slot falls back to its own read.
- The five curated repositories (featured articles, hotels, tours,
  attractions, location grid) now declare their spec; their block selections
  prefetch before the (unchanged) slot loop, so slot order, invalid reasons
  and completeness cannot move.
- Sitemap: minimal `select`; every page read (`readAllPages`, refuses past
  50,000 rows instead of silently stopping at 5,000); one grouped `UNION`
  query for author visibility instead of three counts per author.
- Server-Timing on the city page adds `batches` and `prefetched`.

**Measured** (local prod build; outputs diffed with `jq -S` against a
snapshot taken before the change):

| | Before | After | Output |
|---|---|---|---|
| Lima page | 382 statements, 43 reads | **171 statements, 17 reads** (13 batches, 39 slots prefetched) | byte-identical |
| Medellín, Mexico City | 4 statements | 4 | identical |
| Sitemap entries | 27 statements; 3 counts × authors | **13 statements**, constant in authors | identical |
| Lima, one at a time | p50 253 ms | **p50 91 ms** | |
| Lima, 4 concurrent | p50 860 ms | p50 226 ms | |
| Lima arrivals 6/s (gate on) | p95 1.96 s, 20 refused | **p95 131 ms, 0 refused** | |
| Uncoalesced ceiling, one process | ~4–5 /s | **~12 /s**, overflow shed as fast 503s | |

The assembly gate stays at 2 (it now admits ~12/s); raise it only after
re-measuring on the platform.

**Indexes.** The committed feed indexes (`*_public_location_feed_idx`,
`*_public_author_feed_idx`, partial on published) and the search index are
installed locally (both migrations applied). The new author `UNION` is
covered at scale by the partial author index; `canonical_path` has a unique
index. Local tables are tiny, so their plans are sequential scans and prove
nothing about a large corpus — no new index was justified or added.

**Not done.** Author- and editorial-feature reads (4 per Lima page) are not
batched; cross-block batching (two featured-article blocks share one query)
was not attempted. A publish-time read model is **not needed** on this
evidence: batching met the target without it.

**Tests.** `page-read-budget.test.ts` (one query answers every slot; missing
is null; failed batch falls back; no-op outside a budget; real failure
propagates), `sitemap-reads.test.ts`. Server suite 1497+ passed.

**Rollback.** Revert the PR; no schema or config change.

## CAP-06 — durable refresh and safe startup

**Problem (revalidated, worse than the plan said).** Revalidation and
search-index refresh ran inline in `afterChange`. Payload runs `afterChange`
*inside* the save's transaction, and the search refresh used its own pool
connection, so it read the **previous committed state** of the row: a first
publish could be indexed as "nothing to index" until the next edit or a
rebuild. Revalidation could likewise reach the frontend before the change
was visible. Failures were log lines; nothing retried. Every production boot
also seeded (if empty) and re-synced exchange rates: each of this session's
production restarts rewrote all 23 currency rows via the external API.

**Changed.**
- `features/refresh-outbox/`: hidden `refresh-jobs` collection (migration
  `20260921_214514_refresh_jobs_outbox`, additive: new table + a nullable
  column on `payload_locked_documents_rels`; reviewed, no destructive SQL in
  `up`; applied locally; row counts of critical tables unchanged).
  - `enqueue.ts`: `INSERT … ON CONFLICT (dedupe_key)` **in the save's
    transaction** (a race can never become a unique-violation that rolls the
    editor's save back), wrapped in a `SAVEPOINT` so a failed enqueue cannot
    poison the transaction either. A conflicting row is reset to pending with
    fresh attempts; revalidation targets are unioned.
  - `worker.ts`: claims with `FOR UPDATE SKIP LOCKED` (safe with many
    workers), 60 s claim lock (a dead worker's job is retaken), processes by
    reading current state (search: re-derive the row — missing or unpublished
    removes it; revalidate: idempotent), capped exponential backoff (30 s …
    1 h, 20% jitter), `failed` after 8 attempts, completed rows pruned after
    7 days. A change arriving mid-run is not overwritten by the run's
    completion.
  - `request.ts`: what the hooks call. Outbox on by default; if recording
    fails or `REFRESH_OUTBOX=off`, falls back to the old inline behaviour.
  - Drains: shortly after each enqueue (after commit), every 60 s on
    long-lived production servers (`REFRESH_WORKER_INTERVAL_MS`), and on
    demand: `POST /api/internal/refresh-jobs` (`REFRESH_WORKER_SECRET`),
    `pnpm refresh:jobs -- stats|drain|failed|replay`.
- Revalidation hooks (9) and search-index hooks go through the outbox.
  `deliverClientRevalidation` throws on failure so the worker can retry.
- Startup: production never seeds at boot (warns, points at
  `pnpm bootstrap:currencies` / `pnpm seed:locations`); exchange rates sync at
  boot only when the newest is over 24 h old (`CURRENCY_STARTUP_SYNC`
  overrides). Development unchanged.

**Verified against real Postgres** (`pnpm verify:refresh-outbox`: one
transaction, always rolled back; `refresh_jobs` count 0 afterwards; passed 3/3
runs): repeated change merges into one row and keeps its tags/paths; a
drain claims due jobs; a search job for a missing document completes; a
failed delivery is retried later, not dropped; a job in backoff is not
claimed early; a dead worker's claim is taken over after its lock expires;
after 8 attempts the job is kept as `failed`; a new change revives a failed
job; a change arriving mid-run survives the run's completion.

The verifier found a real bug before merge: `->` and `||` share a precedence
level in Postgres, so the merge concatenated whole objects and a merged
revalidation carried **empty** tags and paths — it would have been marked
done having revalidated nothing. Fixed with parentheses; the check stays.

Prod build: boot logged "Exchange rates are fresh. Skipping boot sync."; the
worker endpoint answered with stats and a drain; 401 without the secret.

**Not exercised.** A real Payload save end to end (hook → enqueue → commit
→ drain → frontend) was not run against the local database; the SQL is
verified above and the hook wiring by unit tests (fallback, savepoint,
off-switch). Publish/media CPU contention was not measured.

**Owed to CAP-07.** A scheduler on the chosen platform calling
`POST /api/internal/refresh-jobs` every minute and
`POST /api/internal/exchange-rates/sync` daily; an alert on
`oldestPendingAgeS` and on `failed > 0`.

**Rollback.** `REFRESH_OUTBOX=off` restores inline behaviour without a
deploy. Reverting the code leaves an unused table; the migration's `down`
drops it (review before running). Pending rows survive a rollback of code and
are drained again once it returns.

## CAP-07 / CAP-08 — prepared, blocked on decisions

Neither can be completed from a Mac: both need a chosen, provisioned,
production-class platform and approval for billed load. What could be done
without that is done:

- [`cap07-platform-readiness.md`](cap07-platform-readiness.md): the six
  owner decisions with a recommendation each; the connection budget worked
  for the recommended fleet; every setting the code now requires; schedulers;
  portable alerts; restore / rollback / dependency-failure rehearsals; cost
  model with measured page weights (Lima HTML 32 KB gzip; images 3.88 MB on a
  full desktop scroll → 3.4–67 TB/month across the plan's range).
- [`cap08-proof-matrix.md`](cap08-proof-matrix.md) and
  `apps/questura/load/k6/`: six k6 scripts, one per proof row, with the
  plan's gates and abort rule encoded as thresholds. Smoke-run against the
  local production builds at tiny scale: every reader scenario 0 failures,
  0 dropped iterations, all thresholds evaluated. The cold-heavy smoke
  confirmed two properties worth knowing on the platform: a `?cold=` suffix
  defeats CDN caching but not server coalescing (use distinct pages), and at
  381 req/s the render bucket (2,400/min for curated pages) throttles — size
  `PUBLIC_READ_RENDER_MULTIPLIER` there.

**Program status.** Not production ready, and not claimed to be. Locally:
the harness tells the truth, overload is bounded and shed cleanly, anonymous
identity costs no database work, every public read is covered and bounded,
Payload's REST mount can no longer hand out 271 MB per request, failures
cannot be cached as content, curated pages keep their last good version,
the Lima page costs 55% fewer statements and a process carries ~3× more
uncached page assemblies, and refresh work is durable. Capacity on the
platform is unmeasured until CAP-08 runs.

## Next action

Owner: D1/D2 are settled in principle (Cloudflare / Railway / Neon / Railway
Redis). Still open: D3 budget, D4 max instances, D5 campaign URLs, D6 recovery
targets. Then approve provisioning plus a spend-capped load test, and settle
the six items in §1a. Then: configure the platform from §3–§4 of that
file, run the rehearsals in §6, and run the CAP-08 matrix row by row.

Before the parked laptop's next deploy: see the box at the top of this file.
