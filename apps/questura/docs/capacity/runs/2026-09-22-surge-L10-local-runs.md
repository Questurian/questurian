# Surge L10 — finite local runs against the fifty-article launch corpus

Local, 2026-09-22/23. One Mac (macOS 15.4.1, 8 cores, 16 GB), production
builds of both apps (`.next-readiness`), one backend process, Postgres 14 on
the host, a dedicated Redis, k6 v2.3.0 on the same machine. Driver:
`load/k6/runs/local-matrix.mjs`; per-scenario JSON (envelope, supervisor
summary, per-class latency, 1 s samples of a probe reader, gate/pool counters
and backend memory) in `2026-09-22-surge-L10/`.

**These numbers describe this Mac, this build and this workload. They are not
a capacity figure for Cloudflare, Railway or any hosted platform.**

## Envelope, declared before running

Max 60,000 requests and 5 min per run; backend RSS ≤ 3,000 MB; queue growth
sustained 10 s stops a run; telemetry gap 5 s; recovery deadline 60 s.
Provisional local thresholds (successful requests only): page p95 < 500 ms,
dynamic p95 < 1 s, page TTFB p95 < 400 ms. Escalation stopped at the first
level showing refusals and pool waiting.

## Run matrix

Journeys: free/gated landings, repeat visits, search, saved items, plus a
fixed 0.4/s bookmark-write and 0.1/s sign-in scenario. 1 journey ≈ 2.4
requests. Latency is med/p95/p99 ms of **successful** requests.

| Scenario | Kind | Offered | OK | Refused | Other fail | Dropped | Correctness | OK req/s | Page ms | Dynamic ms | Ingress act/queue | Private act/queue | Pool wait | RSS MB | Recovery | Exit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| calibrate (5/s) | correctness | 703 | 703 | 0 | 0 | 0 | 0 | 11.7 | 7/18/40 | 4/59/104 | 1/0 | 1/0 | 0 | 383 | — | 0 |
| plateau 10/s | capacity | 1,453 | 1,453 | 0 | 0 | 0 | 0 | 24.1 | 7/16/23 | 3/56/103 | 1/0 | 1/0 | 0 | 394 | — | 0 |
| plateau 20/s | capacity | 3,016 | 3,016 | 0 | 0 | 0 | 0 | 50.1 | 5/12/19 | 3/44/68 | 3/0 | 2/0 | 0 | 537 | — | 0 |
| plateau 40/s | capacity | 6,060 | 6,060 | 0 | 0 | 0 | 0 | 100.6 | 3/7/12 | 2/40/58 | 2/0 | 2/0 | 0 | 614 | — | 0 |
| plateau 80/s | capacity | 12,128 | 12,128 | 0 | 0 | 0 | 0 | 201.2 | 2/5/8 | 1/31/46 | 2/0 | 2/0 | 0 | 748 | — | 0 |
| **plateau 160/s** | capacity | 24,007 | 24,007 | 0 | 0 | 0 | 0 | **380.5** | 1/4/7 | 1/30/44 | 4/0 | 4/0 | 0 | 786 | — | 0 |
| plateau 160/s, one address per VU | capacity | 24,059 | 24,002 | 57 | 0 | 0 | 0 | 398.0 | 1/4/7 | 1/31/45 | 4/0 | 4/0 | 0 | 768 | — | 99 |
| plateau 320/s | capacity | 48,208 | 48,109 | 99 | 0 | 0 | 0 | 796.1 | 1/6/10 | 12/**911**/1044 | **64/127** | **16/48** | **11** | 848 | — | 99 |
| spike 5→50→5/s (10×) | containment | 5,277 | 5,277 | 0 | 0 | 0 | 0 | 52.7 | 2/8/14 | 2/40/64 | 3/0 | 2/0 | 0 | 641 | 0.1 s | 0 |
| cold, dispersed misses (render token) | containment | 749 | 749 | 0 | 0 | 0 | 0 | 8.9 | — | — | 1/0 | 0/0 | 0 | 484 | — | 0 |
| cold, no client address | containment | 749 | 480 | 269 | 0 | 0 | 0 | 5.7 | — | — | 1/0 | 0/0 | 0 | 411 | — | 99 |
| Redis stalled 15 s (5/s) | containment | 848 | 801 | 45 | 2 | 0 | 0 | 12.9 | 7/15/22 | 3/55/95 | 6/0 | 6/0 | 0 | 379 | 0.1 s | 99 |
| DB table locked 12 s (5/s) | containment | 1,015 | 1,009 | 2 | 4 | 0 | 0 | 13.4 | 7/14/21 | 3/65/1178 | 9/0 | 9/0 | 1 | 372 | 0.2 s | 99 |
| publication under load (10/s) | correctness | 3,909 | 3,909 | 0 | 0 | 0 | 0 | 26.0 | 7/47/77 | 3/52/71 | 1/0 | 1/0 | 0 | 471 | — | 0 |

Exit 0 = passed every threshold; 99 = a k6 threshold crossed (availability
0.1 % or latency) without a supervisor stop.

**Privacy and entitlement: zero correctness failures in every scenario** —
no member marker on a public response, no wrong identity, no cross-reader
bookmarks, no cacheable private response, no refusal without `Retry-After`.

## What this says, locally

- **Clean envelope: 160 journeys/s (~380 successful requests/s)**, all pages
  cached, zero refusals, zero pool waiting, backend RSS < 800 MB.
- **Edge: 320 journeys/s.** The ingress gate held at its 64-active limit with
  its queue full (127/128) and refused 99 requests fast; the private gate sat
  at 16 with 48 queued; Payload pool waiters reached 11; dynamic p95 rose to
  911 ms. Throughput kept rising (~800 successful/s) — admission contained the
  overload, it did not collapse. Escalation stopped there.
- **10× spike (5→50/s):** no refusals, recovered immediately.
- **Redis stalled 15 s:** public readers untouched (the probe — a public page
  and anonymous identity — passed every second); the session guard failed
  open as designed; session-backed requests got explicit no-store 503s (45);
  sign-in returned 500 (Better Auth cannot write a session); recovery 0.1 s
  after Redis resumed.
- **Articles table locked 12 s:** reads that needed it were cut off at the 5 s
  lock timeout (bounded, dynamic p99 1.2 s), cached pages kept serving,
  recovery 0.2 s.
- **Publication under load:** 9/9 publication scenarios converged while 10
  journeys/s arrived (the client-freeze step runs on its own; freezing the
  server the load is hitting measures the freeze).

## 100×: not run

100× the 5/s baseline is 500 journeys/s. At 320/s this Mac was already at its
admission limits with k6 on the same machine, so a 500/s arrival run would
measure the generator and the laptop, not the application. It is **unrun**,
not passed. What stands in for it locally: the 320/s run above (gates full,
refusals fast and bounded, throughput still rising) and the blocked-handler
tests that prove every gate's active/queue/wait bounds and release
(`mount-bounds.test.ts`, `private-routes.test.ts`, `admission.test.ts`).
Hosted 10×–100× tiers remain a separately approved hosted run.

## The harness was wrong three times first — fixed, and recorded

Each was found by these runs, not assumed:

1. **One shared session per identity.** Every VU used member B's single
   cookie; at 10/s the per-session guard (120/min) refused it — correctly.
   Now 100 sessions per identity, each a real sign-in from its own address.
2. **Bookmark writes scaled with the crowd.** One synthetic account wrote
   >60/min and the per-account write limit refused it — correctly. Writes and
   sign-ins now run as fixed, low-rate scenarios.
3. **One address per VU.** At 160/s one address asked for ~25+ member bodies
   a minute and met the 30/min per-address limit (57 refusals; kept as
   `plateau-160-one-address-per-vu.json`). Each VU now cycles 8 addresses.

Also fixed: a cold URL joined with a second `?`; a missing response judged on
its headers; a failed sign-in counted as "wrong content" instead of
availability.

## Findings for the hosted plan

- **Shared-address limits are real.** 30 member bodies/min and 60 public
  reads/min per address are tight for a carrier NAT or a campus; the cold run
  with no client address lost 36 % to the public per-address limit. The
  render token keeps frontend render misses out of that bucket.
- **Sign-in depends on Redis.** A Redis outage is a sign-in outage; public
  reading is unaffected.
- **Member-body errors under a DB lock are 500s**, not 503s (the client
  treats both as temporary; the status could be more honest).
- **Empty storage host.** With `BUNNY_STORAGE_HOSTNAME` unset the storage
  adapter writes `https:///media/…` into media URLs instead of leaving no
  image. Sandbox-only today; image bytes are not in local captures.

## Browser capture (built-in browser, anonymous, production build)

| Visit | Backend requests | Preflights | Other |
|---|---|---|---|
| members-only article, fresh | `/api/me` ×1, bookmark refs ×1 | 0 | paywall shown (`data-paywalled`) |
| free article | `/api/me` ×1, bookmark refs ×1 | 0 | 5 viewport RSC prefetches (home, join, country, city, author) |
| search `LM-ART-07` | `/api/me` ×1 | 0 | exactly the expected result |

Before L05 a gated page asked `/api/me` twice (navbar + gated body) and each
cross-origin GET sent `Content-Type: application/json`, a non-simple request
that needed a CORS preflight. Signed-in browser journeys were not captured:
signing in through a browser form is not something this run does; the
signed-in journeys are exercised at the HTTP level by k6 with real sessions.

## Limits

Single backend process; the Node client, not the Worker; warm pre-rendered
pages dominate; images excluded; generator on the same machine. Soak was not
run (each run ≤ 150 s); long-duration drift is untested.
