# L12 — two serving processes behind a proxy

*22 September 2026. `pnpm readiness:serving`: two production builds on 4101
and 4102, a loopback round-robin proxy on 4100. 10/10 checks passed.*

## The question

`pnpm readiness:fleet` proves the worker side — two processes competing for
one queue, a `SIGKILL` recovered, a cross-process advisory lock that really is
exclusive. It names what it cannot cover, because it has no HTTP: routing
fairness, a rolling release under traffic, termination grace, and the split
between what is per process and what is shared.

Two claims in particular were written in comments and never observed with
more than one process running.

## The proxy

Deliberately the smallest router that can be wrong in the ways being tested:
round robin, a drain list, and a count. A real load balancer has health checks
and retries, and both would *hide* the failure being looked for — a rolling
release that drops requests looks fine behind something that retries them.

## What was observed

| | |
|---|---|
| Distinct identities | `readiness-a` / `readiness-b`, so no per-process sum is double counting one process |
| Routing fairness | 40 requests, all 200, admitted **20 / 20** |
| Skewed routing | 30 requests pinned to one process: **30 to a, 0 to b** |
| Shared budget | 45 sitemap requests round robin: **30 served, 15 refused with 429** |
| Rolling release | drain → `SIGTERM` → restart → restore, under continuous traffic: **103 of 103 answered 200** |
| Termination grace | an in-flight request at `SIGTERM` **completed** (HTTP 200) |

## The two claims, now observed

**Admission gates are per process.** Skewed routing landed thirty requests on
one instance and the idle one lent it nothing — its admission counter did not
move. Two instances therefore admit twice as much work as one, which is the
intent, and it means the fleet's real ceiling is the *database's* rather than
any one instance's.

**Rate-limit counters are shared, through Redis.** The sitemap budget is
thirty per IP per minute — the lowest in the app. Split round robin across two
processes, each saw about twenty-two. A per-process counter would have refused
nothing at all. Exactly thirty were served and fifteen refused, so the budget
is the fleet's. This is what `assertProductionConfig` is protecting when it
refuses to boot without `REDIS_URL`: the memory fallback would multiply the
effective limit by instance count, silently.

## Termination grace

The in-flight request completed. That is `next start`'s behaviour, not
anything in this repository, and it is recorded rather than asserted — the
rehearsal reports which it was instead of calling one of them a bug. The
rolling release still drains before signalling, and should continue to: the
zero-failure result above is a property of the *procedure*, not of the
runtime.

## Two harness bugs worth remembering

**A crashed run leaves its children holding the ports.** The next run then
measures those processes while believing they are its own. Both this and the
L05 harness now refuse to start when a port is occupied, and name it.

**Rate-limit windows bleed between phases.** Sixty-second windows and a shared
Redis mean the budget spent by one check is still spent during the next. The
sandbox Redis is now flushed between phases (`sandbox-redis.ts`) — except in
the check whose subject *is* the limiter, which spends the budget on purpose.

## Still not covered

One machine. Nothing here says anything about a real load balancer's health
checks, cross-region routing, or what either platform does to a process it
decides to move. That is **H04**.
