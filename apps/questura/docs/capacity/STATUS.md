# Campaign capacity: status

Execution contract: [`../campaign-capacity-implementation.md`](../campaign-capacity-implementation.md).
Scenarios and rationale: [`../campaign-capacity-plan-2026-09-21.html`](../campaign-capacity-plan-2026-09-21.html).
How to measure: [`README.md`](README.md).

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
| CAP-04 Cache correctness, route coverage | planned | |
| CAP-05 Cold query amplification | planned | |
| CAP-06 Durable refresh, safe startup | planned | |
| CAP-07 Platform, recovery, cost | blocked: awaiting provider, budget, recovery targets | |
| CAP-08 Capacity proof | blocked: needs CAP-07 target | |

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

## Next action

CAP-04: bring the unwrapped public routes under `publicRead`, separate
frontend-render traffic from per-IP limits, make homepage/featured reads
distinguish missing from failed, keep last-good output on failure, and add
bounded prewarming.
