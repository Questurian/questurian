# One refresh scheduler topology

*2026-09-22. Decided while implementing L04 of the local readiness plan.*

The refresh outbox can be drained from four places: the short timer after an
enqueue commits, the periodic timer in a long-lived process, an HTTP call to
`POST /api/internal/refresh-jobs`, and `pnpm refresh:jobs drain`. Left
undecided, a deployment ends up running several of them at once and nobody
can say how many database connections the drains are allowed to use.

## The decision

**The scheduler calls the existing backend over HTTP. It does not get its own
process.**

A platform scheduler (Railway cron, or any external caller with
`REFRESH_WORKER_SECRET`) calls `POST /api/internal/refresh-jobs` every minute.
That request is served by a process that already exists and already has a
connection pool, so it adds *work* to the fleet, not a *member* of it. The
connection budget (`shared/database/pool-budget.ts`) does not change.

The periodic in-process timer stays on for long-lived deployments
(`REFRESH_WORKER_INTERVAL_MS`, default 60 s in production). It is the
safety net for the case where the scheduler itself is down; the two are
deliberately redundant, and `runDrain` makes the redundancy free — a second
drain in the same process joins the first instead of starting alongside it.

## What this rules out, and why

**A standalone job service.** It would be a whole extra process: its own
Payload pool, its own Better Auth pool, its own advisory-lock pool — 41
connections in the current arithmetic, for work that takes a handful. It is
the right answer once refresh work stops fitting inside a serving process's
spare capacity, and it is not the right answer before that. If it is ever
added, it must be declared in `APP_JOB_PROCESS_COUNT` so the budget preflight
counts it.

**Two drains in one process.** Before L04 the HTTP endpoint and the periodic
timer did not know about each other, so a deployment running both had one
process doing two concurrent drains, each claiming its own batch and each
opening its own connections — double the declared concurrency, declared
nowhere. `features/refresh-outbox/lifecycle.ts` now allows one drain per
process; everything else joins it.

## What still overlaps, and has to fit

Three scheduled things can run at the same moment: the refresh drain, the
currency sync, and the nightly Stripe reconcile. They share the serving
process's pools. The budget in `pool-budget.ts` assumes the maxima, so this
is safe by arithmetic, but it is worth stating that nobody has measured the
three running together under load — that is L12/L14 work.

## Consequences

- A deployment must set `REFRESH_WORKER_SECRET`, or the endpoint answers 503
  and the only drain is the in-process timer.
- On a platform where instances do not live long enough for a 60-second timer
  (Workers, short-lived containers), the HTTP scheduler is the *only* drain,
  and losing it means obligations accumulate silently. `oldestPendingAgeS` in
  `GET /api/internal/refresh-jobs` is the number to alert on.
- A deploy stops claiming on `SIGTERM` and lets in-flight work finish
  (`shutdownRefreshWorker`). Anything still claimed keeps its lease and is
  reclaimed by another worker when it expires — the same path a crash takes,
  so there is one recovery story rather than two.
