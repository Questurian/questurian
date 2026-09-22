# Questura campaign capacity: implementation contract

Status: in progress — live ticket status and evidence in docs/capacity/STATUS.md. (Originally: planned; no implementation or capacity test completed by this document.) Prepared 2026-09-21. This is the execution source of truth; the HTML report supplies the calculator, rationale and scenario tables. Update both when targets change. A future agent must receive an implementation instruction from the user; this document alone grants no permission to deploy or provision.

## Outcome and limits

Prepare Questura for campaign-driven traffic while preserving publication, authentication, membership and payment correctness. Retain Next.js, Payload, Postgres, Redis and Bunny. Reduce unnecessary work, bound resources, measure sustainable capacity, and prove recovery. Do not promise capacity from source inspection or local timing.

Confirmed: 10–100 million monthly views refer to external campaign/social views before clicks. Modeling assumptions: 3–12% click-through, 30-day month, 180-second visits, two pages/visit, 10× burst. These are not observed analytics or a ceiling. At 70M × 12%, model yields 8.4M visits/month and 5,833 active burst readers; at 100M, 12M visits and 8,333 readers. A burst concentrating 1% of 8.4M visits into ten minutes yields 140 arrivals/second, far above the 10× model.

Target workload: 6,000 active readers, 8,500 stretch, plus independent arrival-rate tests progressing toward 1,000 predominantly cached page requests/second. At 180-second sessions and two pages/session, 6,000 readers imply about 67 page requests/second—not 6,000 requests/second. Record identity, search, RSC, prefetch and asset traffic separately. No test level passes unless its error and latency gates pass too.

## Fresh-agent bootstrap

1. Work from /Users/alanmalpartida/Desktop/questurian/apps/questura. Discover repository root with git rev-parse --show-toplevel. Read applicable AGENTS.md files and caveman skill. Inspect git status and current branch before editing; preserve other work. Follow codex/ branch convention when creating a branch.
2. Read CONTEXT.md, docs/adr/0003-cached-ssr-for-public-content-pages.md, docs/local-vs-live.md, docs/serverless-launch-checklist.md, then this contract and the HTML report. Re-read any applicable nested instructions before editing.
3. Revalidate each finding against current code. This audit is dated. Already-fixed findings become “verified existing” with source/test evidence; do not recreate work. Inspect package scripts, installed dependencies and current test configuration before invoking commands.
4. Establish current environment without printing secrets: runtime versions, production versus development mode, port availability, dataset size and non-sensitive configuration names. Local Postgres is scratch, never live truth. Do not assume a running port is a production build.
5. Create docs/capacity/STATUS.md and docs/capacity/runs/ when implementation starts. Record starting SHA, active ticket, baseline conditions, evidence paths, decisions, remaining gates and exact next action. No secrets or personal datasets in committed artifacts.
6. Start CAP-01, then CAP-02 and CAP-03. Keep independently reviewable changes; do not combine all phases into one rewrite. Continue through locally executable work authorized by the user, and record external dependencies without treating local completion as production readiness.

## Non-negotiable constraints

- Default execution is Mac localhost: client 3000, server 4000. Use production builds for performance evidence; pnpm dev only for ordinary development. Inspect build scripts first: server build generates Payload types. Do not overwrite an existing developer session or mix dev-build results with production metrics.
- Linux laptop is temporary and parked. No laptop-specific infrastructure project. Final scale proof belongs on selected production-class serverless platform; frontend target is Cloudflare (ADR-0014, which replaced the Vercel intent in ADR-0003); intended stack: Railway backend, Neon Postgres, Redis on Railway (cap07-platform-readiness.md §1a).
- Never set Payload push:true. Follow AGENTS.md schema/migration workflow, destructive-SQL review and row-count safeguards. No existing data may be destroyed to simplify this project.
- No live Stripe mutations, purchases, checkout, email delivery, external resources, deployments, new downloaded tools or skills without authorization required by AGENTS.md. Propose k6 installation if absent; do not install silently. Existing payment fixtures may support local handler tests; do not invent test-mode proof of live behavior.
- Preserve private no-store responses, server-authoritative entitlements, advertised membership prices and intentional nav copy. A client session hint is UI optimization only. Never trust caller-supplied identity/IP headers or put private data in shared HTML.
- Keep current successful deduplication, feed batching, search index, timeout and menu fixes. No framework upgrade, ORM replacement, database sharding, read replicas or extra cache tier unless measured evidence and a separate decision justify it.
- No unsolicited subagents, issue filing, commits, pushes, merges or deployment as part of merely preparing this plan. During implementation follow the user's actual authorized scope.

## Execution tickets

### CAP-01 — Trustworthy baseline and load harness

Problem: apps/server/scripts/measure-public-api.ts mixes response statuses in latency summaries, excludes one sample as cold even for concurrent batches, lacks request deadlines and does not model sustained arrival rates.

Change: separate warmup from measurement; report successful latency separately from 4xx/5xx, timeouts and transport failures; validate bounded CLI arguments; report offered/completed throughput, sample count and workload metadata. Add explicit cold/warm modes and JSON evidence. Add protocol arrival-rate and session scenarios, with per-scenario URL/data manifests. Extend existing diagnostics before adopting another monitoring stack.

First regression cases: a fast 429 or 500 cannot lower successful p95; every warmup response is excluded; hung fetch is timed out and counted; invalid run/concurrency arguments fail clearly. Extract pure helpers only if needed to test behavior. Existing server vitest config covers src tests, not scripts: deliberately register any script test location or test extracted helpers in its covered tree.

Deliverables: repaired harness, focused tests, initial anonymous/cold-content report, scenario definitions and execution instructions. Capture SQL count/time, pool wait, request latency, cache state and payload bytes where available. Missing diagnostics must say unavailable, not zero. Identify load-generator limits and dropped arrivals.

Gate: reproducible small local run against verified production build; status/body validation confirms requests exercised intended content rather than auth errors, empty responses or throttling. Record any baseline failure without hiding it. No heavy load until limits and abort conditions are in place.

### CAP-02 — Connection budget and overload boundaries

Depends on CAP-01 instrumentation; config regression fix can precede full baseline if baseline unavailable.

Problem: shared/database/pool-budget.ts permits allowance=0; config process count defaults to one; actual Payload max is separately hardcoded in payload.config.ts. Autoscaling multiplies pools. Per-request page-read semaphore does not bound all simultaneous requests.

Change: require finite positive integer production budgets/process limits; single-source actual maxima and budget calculation. Account separately for pooler client allowance and physical Postgres backends, direct advisory-lock connections, startup, jobs, administrative reserve and rollout overlap. Do not blindly treat every pooled client as a dedicated backend. Provider-specific enforcement must match selected platform.

Introduce bounded admission for expensive public work, with queue length/age limits and release in finally. Select initial concurrency from baseline and DB budget; document it. Keep cheap identity and critical private work from being crowded out. A per-instance limiter only becomes a total bound when maximum instances are bounded. Aborted requests must not leave abandoned waiters; HTTP cancellation alone does not cancel SQL. Preserve server-side SQL timeouts.

Gate: tests for omitted/invalid config, exact allowance boundary, multiple instances and rollout overlap; overload rejects predictably and queues drain; throwing/timeouts cannot leak slots. Do not increase pools simply to pass a load test. Record how to revert limits safely.

### CAP-03 — Anonymous identity and request amplification

Depends on CAP-01. Start by measuring, not by introducing a session hint.

Trace: PublicChrome → Desktop/Mobile navbar → useAuth → useUserQuery → /api/me → current-principal → Better Auth/profile/account methods. Relevant paths are apps/client/src/lib/user/hooks/useUserQuery.ts, apps/server/src/app/api/me/route.ts and apps/server/src/features/visitor-auth/lib/current-principal.ts. React Query deduplicates within one cache; each fresh visitor can still trigger identity work.

Measure absent, malformed, expired and valid session cookies; SQL, Redis, imports/cold initialization and response bytes. Do not assume no-cookie requests hit the database. Optimize only observed unnecessary work: safe absent-cookie server shortcut, defer account-provider details to account UI if compatible, eliminate duplicate lookups. A client hint is optional and requires a separate correctness rationale; it must not suppress valid sessions or authorize access.

Gate: no-cookie path remains cheap; valid membership, logout, expiry, reconnect, OAuth and cross-tab behavior preserved. Record identity requests/visit before and after with real-browser checks. Live cookie/OAuth claims require separate live evidence under project rules. Local tests are explicitly local evidence.

### CAP-04 — Cache correctness and public-route coverage

Depends on CAP-01; coordinate with CAP-02 and CAP-03.

Inventory custom public endpoints plus exposed Payload REST/GraphQL reads. Record access, cost, field/depth bounds, cache headers, rate-limit coverage and whether requests originate from browsers or frontend servers. Recheck canonical/by-ID article, menu and sitemap routes first. Backend may identify all frontend render traffic by one egress IP: verify actual proxy topology before changing limits. Authenticated internal traffic still needs a bounded budget; never grant bypass based on a public header alone.

Verify Next.js 15 behavior, HTML/RSC distinctions, cookies, tracking parameters, negative responses, invalidation and multi-instance cache storage. Cache-control headers alone are not proof of a CDN hit. Check local behavior now; shared-cache proof waits for target platform. Add bounded prewarming for campaign URLs.

Fix homepage fetch and featured-repository catch-to-null paths: only genuine missing/unpublished references may be omitted. Dependency errors must not become successful partial pages or false 404s. Preserve last good public output on regeneration failure; avoid indefinite stale publication/privacy changes. Define stronger invalidation handling for deletion, unpublishing and access changes.

Gate: timeout/500 during regeneration preserves last good public output where appropriate, new uncached failures remain errors, true missing content remains 404, private responses never shared. Publish/delete/access-change tests confirm correct freshness. Distributed miss coalescing only added if platform behavior fails measured requirement.

### CAP-05 — Reduce cold query amplification

Depends on CAP-01 baseline and CAP-04 failure semantics.

Targets: apps/server/src/features/homepage-featured-content/featured-articles/lib/repository.ts and sibling block repositories; reference-grid/page-read-budget.ts; apps/server/src/app/api/public/sitemap-entries/route.ts. Use current hydrate-refs.ts batching as a reference, not a target for unnecessary rewrite.

Batch references by collection and selected shape; preserve slot order, missing/unpublished filtering, image placement, author visibility and access gates. Reduce relationship depth only when equivalent output can be proven. Replace per-author sitemap counts with bounded grouped visibility; select minimal fields and paginate complete output rather than silently truncating content.

Read representative EXPLAIN (ANALYZE, BUFFERS) plans for safe SELECTs. Verify committed feed/search indexes actually exist; follow migration safeguards for new indexes. Do not use small scratch dataset timings as proof of large-dataset capacity.

Gate: identical public-content outputs, lower measured SQL/read cost, bounded work as corpus grows, and successful comparison at several concurrent cold-read levels. If budgets still fail, write decision for publish-time public read model with schema/version/backfill/invalidation/recovery design before building it.

### CAP-06 — Durable refresh and safe startup

Depends on CAP-04; integrate CAP-05 if a public read model is needed. Database outbox schema follows migration rules.

Move production seed and currency-sync work out of per-instance startup. Keep boot checks read-only/small. Implement durable failed-work recovery for search indexing and public revalidation: enqueue with committed content change, deterministic dedupe keys, idempotent processing, capped retry/backoff and failed-job inspection/replay. Use existing facilities if suitable; do not provision a queue by default.

Specify transaction boundary, newer-update-wins ordering, delete tombstones and retry retention. Do not acknowledge refresh success before durable responsibility exists. A worker/scheduler must actually run on selected platform; local worker logic alone does not finish this ticket. Measure media/publish contention; move expensive image processing only if justified.

Gate: crash after content commit, duplicate delivery, failed delivery, old update arriving after deletion and worker restart all recover correctly. No uncommitted state exposed. Track pending age and failures. Record cleanup and rollback without losing queued obligations.

### CAP-07 — Platform, recovery and cost readiness

Depends on workload measurements from CAP-01–05. External execution requires user authorization.

Decisions needed: backend provider/plan/region; monthly and daily spike budget; max instances/pooler limits; campaign URL set; recovery-time and acceptable-data-loss targets. Frontend is Cloudflare, not Vercel (owner, 2026-09-21; ADR-0014). Backend Railway, Postgres Neon, Redis on Railway are the owner's leaning.

Choose managed Postgres/Redis near backend; validate session advisory locks use direct connection. Set real shared cache, provider quotas and bounded scaling. Schedule existing reconciliation and CAP-06 worker. Configure portable error/latency, pool-wait, backlog and spend alerts. Prove backups by restore; prove release rollback. Complete existing serverless launch checklist without changing intentional laptop pricing during preparation.

Cost model separates Bunny regional bytes, frontend bytes/requests, backend compute, Postgres/Redis, storage and observability. 70M × 12% × two pages × 1MB = 16.8TB/month; measure actual delivered MB/page and billing units before quoting money.

Gate: provider configuration and budgets recorded without secrets; restore/rollback evidence attached; operator action for overload/spend documented. If blocked on selection or approval, mark awaiting external decision and continue independent local work.

### CAP-08 — Capacity proof and release recommendation

Depends on CAP-01–07. Never label local implementation complete as “production ready.”

Execute HTML proof matrix on production-class target: 6,000 readers sustained 30 minutes; 8,500 burst ten minutes; separate hot-page arrival ramp toward 1,000 requests/second; heavy cold requests 10/25/50/100; signed-in mixes 1/10/25%; dependency failures; two-hour soak. Record think time, URL distribution, cache state, payload checks, offered rate and actual generated rate. Cached-page success never substitutes for private/cold-path proof.

Initial gates: target-region warm document p95 TTFB ≤500ms; successful dynamic reads p95 ≤1s/p99 ≤2.5s; unexpected failures <0.1%; legitimate 429/503 included as availability failures; no pool exhaustion, sustained queue growth, cross-user caching or leak. Recovery within two minutes after burst. Report cold-start latency separately, but include it in end-to-end availability. Stop escalation if unexpected errors exceed 1% for 60 seconds, queue grows continuously or spend boundary approaches.

If a gate fails: identify bottleneck from evidence, change one cause, rerun affected scenario. If workload cannot fit budget, explicitly revise target/campaign envelope with user; never lower acceptance criteria silently. Final output declares measured safe workload, reserve/headroom, test limitations and unresolved risks. No claim about 1,000 req/sec until that step actually passes.

## Verification commands and artifacts

Commands run from apps/questura unless stated otherwise. Inspect scripts first; commands are starting points, not permission to alter live systems.

- pnpm --dir apps/server test:int -- src/shared/database/pool-budget.test.ts src/shared/database/timeouts.test.ts — existing focused server tests; add changed-code tests deliberately.
- pnpm --dir apps/server typecheck — after server changes.
- pnpm --dir apps/client test and pnpm --dir apps/client typecheck — when frontend behavior changes.
- pnpm --dir apps/server measure:api -- --runs 10 --concurrent 1 --base http://localhost:4000 — existing small baseline command, only after confirming intended local runtime and routes. Exact CLI may change in CAP-01; update documentation then.
- Build/start commands must be checked against package scripts and existing processes. No next dev timing accepted as production proof. Do not run broad migration/deploy suites blindly; inspect side effects.
- Save sanitized run JSON, summary, request mix, test duration, SHA, runtime/mode, dataset counts, cache warmup method, resource configuration, p50/p95/p99, errors, dropped arrivals and rollback notes under docs/capacity/runs/. Large raw logs stay outside git; link summarized evidence.

## Completion and next-agent handoff

Every ticket status: planned, in progress, implemented locally, verified on target, blocked, or verified existing. Record exact scope of evidence. CAP-07/08 cannot be marked complete merely because their scripts exist.

For each completed implementation slice, update docs/capacity/STATUS.md with problem, changed files, tests and results, before/after measurements, any migration/config requirement, rollback, remaining risks and exact next action. Never include secret values. If a decision is deferred, record reason and triggering evidence, not a silent omission.

Program complete only when required changes and target-platform proof gates pass, operational recovery works, costs fit agreed budget, and launch checklist is satisfied. This plan cannot guarantee traffic volume or production safety by itself.

## Suggested instruction to the next agent

Implement docs/campaign-capacity-implementation.md, using docs/campaign-capacity-plan-2026-09-21.html for scenarios and context. Read AGENTS.md first. Begin CAP-01, CAP-02 and CAP-03; proceed through authorized local work in dependency order. Revalidate findings before editing, preserve existing work and correctness, and maintain docs/capacity/STATUS.md with evidence and next steps. Do not deploy, provision services, install tools, initiate payments or run externally billed load tests without required explicit approval. Clearly separate local implementation from target-platform capacity proof.
