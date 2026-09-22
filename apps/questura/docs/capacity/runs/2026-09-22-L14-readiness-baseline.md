# L14 local baseline after the readiness series — 22 September 2026

A local **production build** of Questura Server on port 4100, against
`questura_readiness_scratch` (a copy of the Mac development database: 25
articles, 31 locations, 24 search rows). Sandbox Redis on 6390. No frontend,
no Stripe, no Bunny, no email.

The question this run answers is narrow and it is the right one for a series
of correctness changes: **did any of it make the public read path slower, or
change what it costs in statements?**

## `pnpm measure:api --scenario public-api --cache warm --runs 10`

| step | n | ok | p50 ms | p95 ms | statements | reads | pool waiting | bytes |
|---|---|---|---|---|---|---|---|---|
| city homepage | 10 | 10 | 82.9 | 137 | **171** | 17 | 9 | 56 251 |
| author page | 10 | 10 | 16.1 | 16.8 | 22 | – | 1 | 2 866 |
| country cities | 10 | 10 | 4.2 | 4.8 | 4 | – | 1 | 102 |
| search | 10 | 10 | 31.0 | 32.7 | 26 | – | 1 | 12 417 |
| location feed | 10 | 10 | 23.7 | 25.5 | 28 | – | 2 | 10 640 |
| article index | 10 | 10 | 24.5 | 33.2 | 9 | – | 0 | 11 352 |
| article by path | 10 | 10 | 29.2 | 34.1 | 17 | – | 1 | 23 969 |
| navigation menu | 10 | 10 | 4.4 | 6.2 | 4 | – | 1 | 864 |
| sitemap entries | 10 | 10 | 5.7 | 7.8 | 13 | – | 5 | 4 138 |
| **identity (no cookie)** | 10 | 10 | 1.4 | 2.0 | **0** | – | 0 | 40 |

100 offered, 100 completed, 0 dropped. Pool max waiting **0**, max total 8.

**The two numbers that matter:**

- The city homepage is still **171 statements**, the same figure the earlier
  audit recorded. Nothing in L01–L12 added a read to the public path.
- Anonymous identity is still **0 statements**. The new `private` admission
  gate applies only when a session cookie is present, so CAP-03's guarantee —
  an anonymous identity check does no database or Redis work — survives it.

## The new bounds, verified against the running server

| Probe | Result |
|---|---|
| `POST /api/graphql` anonymous | **401**, "Anonymous GraphQL is closed. The public site reads through /api/public/*…" |
| `GET /api/locations?limit=1000&depth=10` | 200, clamped to `limit: 100`, depth 2 — 37 KB in 25 ms |
| `GET /api/locations?pagination=false` | 200, clamped to `limit: 100` — *not* every row |
| `GET /api/globals/main-homepage?depth=10` | 200, 503 bytes — the global is bounded, which it was not |

The corpus here has 31 locations, so this cannot reproduce the original
271 MB response; what it does show is that `limit`, `depth` and `pagination`
are clamped before Payload sees them, which is the mechanism that made the
271 MB possible.

## `GET /api/internal/db-stats`, live

```
instance a4519862  pid 70429  role serving
configFingerprint 9835c2947f94
readiness ready=true degraded=[]
payloadPool {total: 8, idle: 7, waiting: 0}
admission ingress {limit 64, admitted 99, refused 0}
admission private {limit 16, admitted 0}
redis {state: closed, opened: 0, shortCircuited: 0}
refresh backlog {pending 0, running 0, failed 0, oldestPendingAgeS null, expiredRunning 0}
budget: direct topology, 2 processes × 41 (20 payload + 10 visitor auth + 10 advisory locks + 1 startup)
```

`ingress.admitted: 99` against `private.admitted: 0` is the CAP-03 guarantee
stated as a measurement rather than as an intention: every public read passed
through the new ingress stage, and no anonymous identity check reached the
private gate.

`/api/health/ready` answered `ready: true, attempts: 1` — L04's readiness
path exercised in a real production-mode boot, not a unit test.

## No optimizations were applied

The plan is explicit that L14 optimizations must be **evidence-driven**, and
this corpus demonstrated no bottleneck: zero pool waiting, zero dropped
arrivals, and statement counts unchanged from the prior baseline. Changing
anything here would be a speculative optimization justified by nothing, which
is the failure mode the plan names.

## What this is not

25 articles and 31 locations is a small corpus. The plan's L14 asks for
deterministic small/medium/large corpora with many distinct heavy cities,
valid-session load, publish-during-load contention, browser assets and
sustained fault recovery. **None of that was built, and this run does not
stand in for it.** What it establishes is a regression baseline for the
changes actually made.

It is also a Mac. These milliseconds describe this machine and this dataset.
The statement and read counts describe the code, and those are the numbers
worth comparing across releases.

## One thing this run caught that the test suite could not

The production build **failed** the first time, with `Module not found: Can't
resolve 'crypto' / 'fs' / 'path'`. L04 had rewritten `instrumentation.ts` to
use an early `return` instead of wrapping its body in
`if (process.env.NEXT_RUNTIME === 'nodejs') { … }`. Next eliminates that block
statically for the edge bundle; an early return leaves the dynamic imports
reachable, and the edge bundle then tries to resolve Node built-ins through
Payload's config.

Every unit test passed, typecheck passed, and CI was green — because **CI does
not run a production build**. That gap is recorded in the handoff.

## Restore rehearsal (L15)

`pnpm readiness:restore` — dump `questura_readiness_scratch`, restore into
`questura_readiness_restore`, compare. **10/10 checks, 1 879 ms** for 25
articles, 31 locations, 18 671 media assets, 24 search rows.

Row counts survived exactly. So did a refresh obligation that was **pending
at dump time**, with its generation intact — which is the check worth having:
an obligation that survives a content restore but loses its queue row is a
page that is permanently stale with nothing recording that it is. No restored
search row points at an unpublished article.

This rehearses the *procedure*. It is not PITR, not a managed backup, and not
a statement about how long a provider restore takes.
