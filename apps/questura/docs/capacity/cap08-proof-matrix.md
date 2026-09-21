# CAP-08 — capacity proof on the target platform

**Status: blocked on CAP-07.** The scripts exist and were smoke-run against
local production builds (tiny scale, 2026-09-21: every threshold evaluated,
0 failures, 0 dropped iterations on all reader scenarios). That proves the
scripts, not the capacity. No claim about 1,000 requests/second, 6,000
readers or 8,500 readers holds until the matching row below passes on a
production-class deployment.

Scripts: `apps/questura/load/k6/`. Harness for correctness-classified runs:
`pnpm measure:api` (`docs/capacity/README.md`).

## Before any run

1. Written approval for an externally billed load test, with a spend cap.
2. Target running the release under test; record its SHA.
3. `pnpm prewarm:campaign` against the target.
4. `DB_STATS_SECRET` and `REFRESH_WORKER_SECRET` to hand, polling
   db-stats and refresh-jobs every 10 s during the run.
5. The load generator is not the bottleneck: run k6 from a machine near the
   target region, and watch its own CPU; `dropped_iterations > 0` means the
   server was offered less than the schedule.
6. Representative, non-sensitive data. Never load checkout, Stripe, email,
   sign-up or uploads.

Common flags: `-e CLIENT_URL=… -e BASE_URL=… [-e URLS=…] [-e ARTICLE_URLS=…]`.
`SCALE`/`TIME_SCALE` exist for smoke runs only — a proof runs at 1.

## The matrix

| Row | Script | Load | Passes when |
|---|---|---|---|
| 1 | `campaign-readers.js` | 100 → 1,000 → 3,000 → 6,000 readers, 30 min sustained (≈ 67 page req/s + identity) | gates below; stable pool waiting and memory; no cross-user caching |
| 2 | `burst-8500.js` | 8,500 readers 10 min, then 1,000 for 5 min | gates; back to baseline latency within 2 min; no restart |
| 3 | `hot-arrival.js` | 100 → 250 → 500 → 1,000 page req/s, 5 min each | the highest level where gates hold is the ceiling; cap campaign exposure below it with reserve |
| 4 | `cold-heavy.js` | 10 / 25 / 50 / 100 concurrent uncached heavy reads | no unexpected failure; overload is a fast 503; no pool exhaustion. Needs `HEAVY_PATHS` with many *distinct* curated pages — the `?cold=` suffix defeats CDNs, not server coalescing |
| 5 | `signed-in-mix.js` | signed-in share 1 / 10 / 25%, then identity to 500 req/s | correct membership answers; no private response cached; `SESSION_COOKIE` from a dedicated test account |
| 6 | `soak.js` | 2 h at the safe level (`SAFE_READERS`) | no drift in memory, pool waiting, refresh backlog or error rate; drills (Redis down, DB latency, rolling deploy, publish during traffic) one at a time |

## Gates (encoded in `lib/config.js`)

- Warm page p95 ≤ 500 ms (`kind:page`), dynamic reads p95 ≤ 1 s and
  p99 ≤ 2.5 s (`kind:dynamic`).
- Failed requests < 0.1%. Legitimate 429/503 count as failures (for a
  reader a throttle is an outage); row 4 alone allows controlled 503s.
- Checks > 99.9%; zero dropped iterations.
- **Stop escalating** when failures exceed 1% for 60 s (k6 aborts), when
  pool waiting grows without draining, or when spend nears the cap.

## Recording

Per run, in `docs/capacity/runs/`: SHA, platform and plan, instance count,
pool/gate settings, dataset size, cache warmup, k6 summary JSON
(`--summary-export`), db-stats and refresh-jobs samples, offered vs achieved
rate, dropped iterations, and what failed. If a gate fails: find the
bottleneck from that evidence, change one thing, re-run that row. If the
workload cannot fit the budget, revise the campaign envelope with the owner
— never the gates.
