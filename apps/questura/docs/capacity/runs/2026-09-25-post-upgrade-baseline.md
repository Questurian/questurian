# Post-upgrade local baseline — 25 September 2026

Launch fix plan item 9. The L10 journey ladder re-run after the upgrades
(#683 client on Next 15.5, #684 server on Payload 3.90 + Next 16) and after
every launch-fix item, plus the scenarios the plan found missing. Per-scenario
JSON in `2026-09-25-post-upgrade/` (same shape as `2026-09-22-surge-L10/`).
Driver: `load/k6/runs/local-matrix.mjs` with `MATRIX_RUN=2026-09-25-post-upgrade`.

**These are LOCAL numbers from the owner's Mac. They are not a capacity figure
for Cloudflare, Railway, Neon or any hosted platform.** k6, both apps,
Postgres and Redis all ran on the same machine.

## The machine, and why the comparison needs care

| | L10 (22–23 Sep, `2026-09-22-surge-L10-local-runs.md`) | This run (25 Sep) |
|---|---|---|
| Machine | "One Mac (macOS 15.4.1, 8 cores, 16 GB)" | Apple M1, 8 cores, 16 GB, macOS 15.4.1 |
| Postgres | 14 on the host | **16.15 on the host (Homebrew), port 5442, `fsync=off`, `synchronous_commit=off`, `shared_buffers=128MB`, not on a tmpfs** |
| Path to the API | k6 → backend directly | k6 → **the front-door edge** (`front-door-edge.ts`, a Node proxy added by item 10) → backend |
| Client | Next 15.4 build | Next 15.5 build (#683) |
| Server | Payload 3.x + Next 15 | Payload 3.90 + Next 16 (#684), plus items 1–17 |
| Redis | dedicated `redis-server` | dedicated `redis-server` 6390 |
| Generator | k6 v2.3.0, same machine | k6 v2.3.0, same machine |

The brief for this item expected the earlier baselines to be from the Linux
laptop. The L10 write-up itself records a Mac with the same specification as
this one, so the L10 ladder was most likely run on this machine. That makes
the comparison closer than feared, but it is still not like for like:

- **Machine differences** (not code): Postgres 14 → 16 with durability turned
  off and on ordinary disk, and whatever else was running on the Mac each day.
  The earlier Linux-laptop sandbox runs (Postgres 16 on a tmpfs in docker,
  7.5 GB RAM) are a different machine altogether; nothing here is compared
  with them.
- **Harness differences**: every API call now takes one extra local hop
  through the front-door edge. That adds latency to dynamic requests and is
  not a regression in the app.
- **Code differences**: the upgrades and the launch-fix items. Only a
  difference that survives the two points above is evidence about code.

## Journey ladder, before and after

Same workload (`workloads/launch-local.json`, 50-article launch corpus), same
envelope (≤ 60,000 requests, ≤ 5 min, RSS ≤ 3,000 MB), same journey mix
(~29% signed in), 1 journey ≈ 2.4 requests. Latency is med/p95/p99 ms of
successful requests.

| Scenario | OK req/s before → after | Page ms before → after | Dynamic ms before → after | Refused after | Pool wait after | RSS MB before → after |
|---|---|---|---|---|---|---|
| calibrate 5/s | 11.7 → 12.9 | 7/18/40 → 8/24/30 | 4/59/104 → 5/35/100 | 0 | 0 | 383 → 337 |
| plateau 10/s | 24.1 → 25.4 | 7/16/23 → 7/17/24 | 3/56/103 → 4/30/40 | 0 | 0 | 394 → 339 |
| plateau 20/s | 50.1 → 51.1 | 5/12/19 → 3/10/19 | 3/44/68 → 3/23/36 | 0 | 0 | 537 → 351 |
| plateau 40/s | 100.6 → 100.9 | 3/7/12 → 2/6/10 | 2/40/58 → 2/19/25 | 0 | 0 | 614 → 356 |
| plateau 80/s | 201.2 → 200.7 | 2/5/8 → 2/5/8 | 1/31/46 → 1/17/22 | 0 | 0 | 748 → 395 |
| **plateau 160/s** | **380.5 → 400.9** | 1/4/7 → 2/5/7 | 1/30/44 → 2/21/31 | 0 | 0 | 786 → 679 |
| plateau 320/s | 796.1 → 715.8 (stopped) | 1/6/10 → 2/10/19 | 12/911/1044 → 16/855/1126 | 80 | 9 | 848 → 652 |
| spike 5→50→5/s | 52.7 → 52.6 | 2/8/14 → 2/7/12 | 2/40/64 → 2/19/29 | 0 | 0 | 641 → 394 |

Zero correctness failures in every scenario (no member marker on a public
response, no wrong identity, no cross-reader bookmarks, no cacheable private
response, no refusal without `Retry-After`). Zero dropped arrivals.

### What changed, and what caused it

- **Clean envelope unchanged: 160 journeys/s (~400 successful requests/s),**
  zero refusals, zero pool waiting. Every plateau up to 160/s passed every
  gate, as before.
- **Saturation point unchanged: 320 journeys/s.** The ingress gate filled
  exactly as before (64 active, 125 of 128 queued; private gate 16/48; pool
  waiters 9; dynamic p95 ~0.9 s). The difference is how the run ended: L10
  refused 99 of 48,208 over the full minute; this time the refusals came in
  the first seconds, crossed the supervisor's 1% rolling-window stop, and the
  run was stopped at 6,442 requests (exit 90). Same ceiling, earlier refusals.
  Not enough to call a regression from one run; worth re-running on the
  platform, not here.
- **Dynamic p95 roughly halved at every level** (e.g. 40/s: 40 → 19 ms;
  160/s: 30 → 21 ms) **despite the extra edge hop.** The likely causes are a
  mix: Postgres 16 with fsync off (machine) and the upgraded server (code).
  This run cannot separate them, so it is not claimed as a code win.
- **Backend memory is lower** at every level (160/s: 786 → 679 MB; 80/s:
  748 → 395 MB). Postgres runs in its own process either way, so this is the
  Node process. Most likely code (Next 16 / Payload 3.90), but a single run
  per level on a machine doing other work; treat as "not worse".
- **Page latency is unchanged** within a millisecond or two: pages are served
  from the client's cache in both runs.
- The spike recovered in under a probe interval (0.0 s from the probe's view;
  L10: 0.1 s).

## The new scenarios

| Scenario | What it models | Result |
|---|---|---|
| `signed-in-2pct` | the 40/s plateau with a launch-like **2% signed-in share** instead of ~29% | 94.7 OK req/s, 0 refused; dynamic p95 **4 ms** (vs 19 ms at the default mix): signed-in reads are what the dynamic tail is made of |
| `viral-article` | **50 visits/s on one free article** through the site, each with its identity check and bookmark refs | 149 OK req/s, 0 refused; page p95 **3 ms**; **100.0% of 3,001 pages were cache hits**; **0 render calls reached the API** for the 60 s (edge counters) |
| `crawler` | a crawler at **2/s over the sitemap** beside **10 reader journeys/s** | 0 refusals; crawl p95 21 ms; readers' page p95 **10 ms** (the 10/s plateau alone: 17 ms), so the crawler did not slow readers. The sandbox sitemap has 68 URLs, so 120 s at 2/s covered all 68 and wrapped |
| `cold-start` | every stack app stopped and started, then **10 journeys/s at once** | 0 refused, 0 probe failures; first-minute probe p95: page 21 ms, identity 8 ms; whole run page p95 17 ms, dynamic 29 ms |

The cold start is a process restart with the same build: in-memory caches and
pools start empty, but the build's pre-rendered pages and the client's disk
cache survive. On the platform a deploy also empties the edge cache, so PL3's
S5 (redeploy the API, then 10/s) is the real test; this is its local
stand-in. The viral scenario reads the Node client's `x-nextjs-cache`; on
Cloudflare the script reads `cf-cache-status` instead.

## The load identity (decision D3), shown end to end

The sandbox edge was switched to overwrite `CF-Connecting-IP` with the real
peer address, as Cloudflare does, so the whole k6 run became one caller:

| Scenario (20 journeys/s, 60 s, edge overwriting addresses) | OK | Refused | Result |
|---|---|---|---|
| `one-ip-through-edge`, no load identity | 2,932 | **155 (5.0%)** | exit 99: the per-address limits refused the "crowd" at a load the backend barely noticed (ingress 1 active, no queue) |
| `load-identity-through-edge`, signed load identity | 3,115 | **0** | exit 0: each synthetic reader counted as itself again |

That is the one-IP problem the plan describes, reproduced at 20/s on a
laptop, and its fix. Through the real Cloudflare the same thing happens
before any backend is busy, which is why PL3 needs the key.

Guard rails, each proved (details in `../load-identity.md`):

| Guard rail | Proof |
|---|---|
| Off by default | unit tests; the stack without `--load-test-window` reported `loadIdentity: "off"` |
| 32+ characters | boot refuses a shorter key (unit tests; the stack's key is 48 hex characters) |
| Only during the window | `LOAD_TEST_UNTIL` required, ≤ 12 h after boot, key dead after it (unit tests); the stack sets it from `--load-test-window` |
| Every use logged | sandbox backend log: one `Load identity used` line per request with the address (`198.18.9.9`), one `Load identity refused` line each for a forged signature and for a signed non-benchmark address (`203.0.113.7`); about 2,000 lines for the `load-identity-through-edge` run |
| launch:verify fails while set | sandbox, same build: **45/45 passed** with the load identity off; **44/45** with it on, the one failure being "the API has no load-test key set (load identity off) — loadIdentity="on"" |

## Not run, and why

- **`measure:api --scenario public-api` (the Lima control, 171 statements):**
  Lima exists only in the Mac's development database on 5432, which now holds
  real data and is off limits. The sandbox corpus has no Lima. The
  statement budgets for the launch corpus are enforced on every CI run by
  `readiness:routes` instead.
- **100×, soak, Redis and database faults:** not re-run; L10's results stand
  as the local record, and CI's `full-ci` run covers the fault checks.
- **Anything hosted.** PL3 on the platform, with the owner's spending cap, is
  the capacity test. This is a regression baseline.
