# L13 negative controls — 22 September 2026

`node load/k6/negative-control/run.mjs`, Mac localhost, k6 v2.3.0, Node
v24.15.0. Loopback only; nothing billed, no provider contacted.

**16/16 controls behaved as required.**

## Response faults (target must make the proof fail)

| Fault | k6 exit | Gate that caught it |
|---|---|---|
| `none` (healthy) | 0 | — must pass, and does |
| `wrong-content` | 99 | content marker `data-revision` |
| `wrong-redirect` | 99 | exact `Location` |
| `identity-lies` | 99 | `authenticated`/`member` compared to the manifest |
| `member-body-to-anonymous` | 99 | `excludes` marker on the public page |
| `private-is-cacheable` | 99 | `/api/me` must be `no-store` |
| `cacheable-with-cookie` | 99 | no `Set-Cookie` on a cacheable response |
| `reader-throttled` | 99 | a 429 is a reader outage, not a pass |

## Settings that must be refused before load starts

| Setting | k6 exit |
|---|---|
| `SCALE=abc` | 107 |
| `SCALE=0` | 107 |
| `TIME_SCALE=-1` | 107 |
| no workload manifest | 107 |
| empty URL list | 107 |
| path without a leading slash | 107 |
| signed-in share with no session cookie | 107 |
| cold corpus below the 25-URL minimum | 107 |

## Rolling-window supervisor

`node supervise.mjs negative-control/probe.js -- --vus 2 --duration 20s`
against the `reader-throttled` target, `ABORT_MIN_SAMPLES=20`:

```
[supervise] stopping the run: failure rate 45.00% over the last 60s
            (9/20 requests) exceeds 1.00%
exit 90
```

The cumulative k6 threshold would not have stopped this run inside twenty
seconds; the window did.

## What this does and does not show

Shows: each proof gate detects the failure it claims to detect, and a bad
setting stops a run before it spends anything.

Does not show: anything about Questura's capacity. The target here is a
forty-line fake. These controls are about the instrument, not the system.
