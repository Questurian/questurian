# CAP-07 — platform, recovery and cost readiness

**Status: blocked on owner decisions.** Nothing here has been provisioned,
bought or deployed. This file turns the decisions into a short list, gives a
recommendation for each, and records every setting and procedure the code
now depends on, so the platform work is configuration rather than discovery.

## 1. Decisions the owner has to make

| # | Decision | Why it blocks | Recommendation |
|---|---|---|---|
| D1 | Backend provider, plan, region | Every limit below is per platform | A long-lived container platform (fixed small fleet with an autoscale cap) in the same region as the database, rather than per-request functions. The admission gates and pool budgets are per process; per-request functions multiply both and push the database behind a pooler at every scale. Frontend stays on Vercel (ADR-0003). |
| D2 | Managed Postgres and Redis (and whether a pooler is used) | Sets `DATABASE_MAX_CONNECTIONS` and the pooler values | Postgres in the backend's region with point-in-time recovery; Redis in the same region. With a long-lived fleet of ≤ 6 instances a direct connection fits (below); a pooler becomes necessary past that. |
| D3 | Monthly budget and tolerated one-day spike | Autoscale caps and spend alerts need a number | Set before the first campaign; alerts at 50/80/100% of the daily spike figure. |
| D4 | Maximum instances | Makes the per-process gates a total bound | Start at 4 serving + 1 surge; raise only with a re-run of CAP-08 rows 3–4. |
| D5 | First campaign landing URLs | Prewarm list and the proof's URL mix | Fill `docs/capacity/campaign-urls.txt`. |
| D6 | Recovery-time and acceptable-data-loss targets | Chooses backup/PITR tier | e.g. RTO 1 h, RPO 5 min (PITR). |

## 2. Connection budget worked for the recommendation

Per instance with default pools: 20 Payload + 10 Better Auth + 10 advisory
locks + 1 startup = 41. Direct topology, 4 serving + 1 surge + 1 job:

```
(4 + 1 + 1) × 41 + 5 reserve = 251 backends  → needs max_connections ≥ 251
```

Smaller per-instance pools fit a cheaper database:

```
DATABASE_POOL_PAYLOAD_MAX=10  DATABASE_POOL_VISITOR_AUTH_MAX=5  DATABASE_POOL_ADVISORY_LOCK_MAX=4
(4 + 1 + 1) × (10 + 5 + 4 + 1) + 5 = 125
```

The assembly gate admits 2 page assemblies per process, each holding up to 6
connections, so a Payload pool of 10–12 still leaves room for everything
else. Re-measure (CAP-08 row 4) before shrinking further. Production refuses
to boot if the declared numbers do not add up (`pool-budget.ts`).

## 3. Settings the code now depends on

Required in production (boot refuses without them — and since CAP-02 the
refusal really stops the process):

| Variable | Set to |
|---|---|
| `DATABASE_MAX_CONNECTIONS` | Real Postgres backends allowed |
| `APP_PROCESS_COUNT` | Maximum serving instances (the autoscale cap) |
| `APP_ROLLOUT_SURGE` | Extra instances alive during a deploy |
| `DATABASE_POOLER_MAX_CLIENTS`, `DATABASE_POOLER_POOL_SIZE` | Only if `DATABASE_URI` is pooled; plus `DATABASE_URI_UNPOOLED` |
| `TRUSTED_PROXY` | The platform actually terminating requests (existing rule) |

Recommended:

| Variable | Purpose |
|---|---|
| `QUESTURA_RENDER_TOKEN` (both apps, 32+ chars) | Frontend renders get their own bounded bucket |
| `REFRESH_WORKER_SECRET` | Protects `/api/internal/refresh-jobs` |
| `EXCHANGE_RATE_SYNC_SECRET` | Protects the daily rates sync |
| `DB_STATS_SECRET` | Protects `/api/internal/db-stats` |
| `REDIS_COMMAND_TIMEOUT_MS` / `REDIS_CONNECT_TIMEOUT_MS` | Defaults 1000 / 3000 |
| `PUBLIC_ASSEMBLY_*`, `PUBLIC_QUERY_*` | Gate sizes; defaults sized on a Mac — re-measure |
| `PUBLIC_READ_RENDER_MULTIPLIER` | Default 20 |
| `APP_JOB_PROCESS_COUNT`, `DATABASE_RESERVED_CONNECTIONS` | Defaults 1 / 5 |

## 4. Schedulers

| Every | Call | Why |
|---|---|---|
| 1 min | `POST /api/internal/refresh-jobs` (Bearer `REFRESH_WORKER_SECRET`) | Retries and leftovers of the refresh outbox; instances may not live long enough to drain |
| 1 day | `POST /api/internal/exchange-rates/sync` (`x-sync-secret`) | Boot no longer syncs fresh rates |
| existing | nightly Stripe reconcile | Unchanged; runs as one job process (`APP_JOB_PROCESS_COUNT`) |
| each deploy, before a campaign | `pnpm prewarm:campaign -- --client <origin> --urls docs/capacity/campaign-urls.txt` | First readers hit a rendered page |

Deploy steps that used to happen at boot: `pnpm db:migrate`, then (fresh
database only) `pnpm bootstrap:currencies`, `pnpm seed:locations`,
`pnpm rebuild:search-index --if-empty`.

## 5. Alerts (portable; any monitoring stack)

| Signal | Source | Alert when |
|---|---|---|
| 5xx rate, p95/p99 per route class | platform metrics | 5xx > 0.1% for 5 min; dynamic p95 > 1 s |
| Pool waiting | `/api/internal/db-stats` → `payloadPool.waiting` | > 0 sustained 2 min |
| Gate refusals | db-stats → `admission.*.refused` | rising for 5 min (shedding load) |
| Refresh backlog | `/api/internal/refresh-jobs` → `oldestPendingAgeS`, `failed` | age > 10 min, or failed > 0 |
| Spend | provider billing | 50/80/100% of the daily figure (D3) |

Operator action on overload: stop or slow the campaign send first; raise the
autoscale cap only within the connection budget (§2); never raise pool sizes
to make errors go away.

## 6. Recovery rehearsals (to run on the chosen platform)

1. **Restore.** Restore the latest backup (or a PITR point) into a scratch
   database, point a scratch backend at it, run `pnpm db:migrate:status`,
   `pnpm rebuild:search-index`, and read `/peru/lima` through it. Record the
   wall time against the RTO and the restore point against the RPO.
2. **Rollback.** Deploy the previous release; confirm the refresh outbox
   drains (its table survives a code rollback) and pages still render.
   `REFRESH_OUTBOX=off` is the no-deploy switch back to inline refresh.
3. **Dependency failure.** Stop Redis for 2 minutes during a CAP-08 soak:
   public reads must keep serving (limits fail open), payments must refuse
   (fail closed), no retry storm.

## 7. Cost model (fill in with the chosen plans)

Measured locally (2026-09-21), per page view:

| Item | Size |
|---|---|
| Lima HTML | 259 KB raw, **32 KB gzip** |
| Article HTML | 124 KB raw, 24 KB gzip |
| Shared JS | ~100 KB first load (build output) |
| Lima images, desktop 1440@2x, full scroll | **3.88 MB** (PR #564, measured 2026-09-19) |

So a page view is roughly 0.2 MB (bounce above the fold) to 4 MB (full
scroll, desktop). At the plan's 70M × 12% × 2 pages = 16.8M page views a
month: **3.4 TB at 0.2 MB, 16.8 TB at 1 MB, 67 TB at 4 MB**, almost all of it
images on Bunny. Measure real delivered bytes per page on the target (CDN
logs) before quoting money.

```
monthly cost ≈ Σ region (Bunny GB × rate) + frontend (bytes + requests + ISR writes)
             + backend (instance-hours × plan) + Postgres + Redis + storage + observability
```

Backend requests per campaign page view, from CAP-01–05: one `/api/me`
(no database work when anonymous) and, on the article page, one
`bookmarks/refs` (same); cached pages make no backend content calls.
