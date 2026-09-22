# Surge L08 — workloads, telemetry and stops that prove what they claim

Local, 2026-09-22. k6 v2.3.0. Loopback fake target for the controls; the
sandbox stack (launch corpus, production builds) for the journey smoke.

## What was wrong (discovery finding 10)

- The supervisor watched a pool metric **no scenario emitted**, and ignored
  zero samples, so a queue could never stop a run and a drained queue could
  never reset.
- It watched HTTP status only: a wrong page that answered 200 kept the run
  going.
- Signed-in tags were on checks, not on requests, so signed-in latency was
  averaged with anonymous latency.
- The cold scenario held constant virtual users (a slow backend quietly
  lowered the offered load) and passed on nothing but fast 503s.
- Identity checks accepted any boolean.

## What changed

- `supervisor/policy.mjs` + `supervise.mjs`: distinct stop reasons and exit
  codes (64/90/91/92/93/94/95/97), every setting validated first, telemetry
  polled from each declared instance directly and judged per instance,
  queue-growth history cleared on a drain, restarts and strangers invalidate
  the run, `containment` vs `capacity` vs `correctness` run kinds, a success
  floor for capacity claims, a bounded summary.
- `lib/requests.js`: request-level tags (`kind`, `name`, `signed_in`,
  `expect`); `questura_correctness{class}` on every exact-check failure;
  exact identity by email and entitlement; member-body and bookmark-refs
  checks; refusals must carry a valid `Retry-After` and `no-store`;
  per-VU synthetic client addresses (198.18.0.0/15).
- `lib/config.js`: successful-request latency by class, TTFB apart from full
  duration, `questura_correctness` count threshold.
- `cold-heavy.js`: open arrivals, success-share and refusal-policy thresholds.
- `launch-journeys.js` + `lib/build-launch-workload.mjs` + `pnpm readiness:sessions`.

## Results

**Policy unit tests: 23/23** (`node --test load/k6/supervisor/policy.test.mjs`).

**Negative controls: 28/28** (`node load/k6/negative-control/run.mjs`).

| Supervisor control | Exit | Stop after decision |
|---|---|---|
| wrong 200 body | 91 wrong_content | ~130 ms |
| leaked member marker | 91 privacy | ~115 ms |
| identity that lies | 91 identity | ~115 ms |
| private response marked cacheable | 91 cache_policy | ~130 ms |
| refusal without Retry-After | 91 refusal_policy | ~115 ms |
| queue growth on the instance | 92 | ~120 ms |
| telemetry that stops answering | 93 | ~140 ms |
| telemetry from a stranger | 93 | ~110 ms |
| invalid abort setting | 64 | before start |
| all-503 claimed as capacity | 97 (0 successes, 480 refusals) | at end |
| generator saturation | 95 | ~115 ms |
| benign short spike | **0 (did not stop)** | — |

Plus the sixteen earlier controls (eight response faults, eight refused
settings), unchanged and passing.

**Journey smoke against the sandbox** (3 journeys/s for 15 s, correctness run):
106 requests, 0 HTTP failures, 0 correctness failures. It found two harness
bugs before any load run: the scenarios sent `Origin: http://127.0.0.1:3100`
(refused, correctly, as cross-site — the manifest now names the browser
origin), and search URLs were not matched because of their query string.

## Limits

The stop controller is a local prerequisite, not a provider spending cap.
Hosted runs still need real platform limits and cost alerts.
