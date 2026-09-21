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
| CAP-02 Connection budget and overload | planned | |
| CAP-03 Anonymous identity | planned | |
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
| `cold-content`, first request per URL, fresh process | Lima page 377 ms; others 6–51 ms. |
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

## Next action

CAP-02: make boot refusal real, require and single-source the connection
budget, bound heavy public work with an admission gate sized from the sweep
above (pool saturates at 4 concurrent Lima assemblies per process), and stop
the coalescing bypass.
