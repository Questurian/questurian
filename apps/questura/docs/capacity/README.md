# Capacity measurement

How to measure what Questura can absorb. The plan and the tickets are in
[`../campaign-capacity-implementation.md`](../campaign-capacity-implementation.md);
progress is in [`STATUS.md`](STATUS.md); evidence goes in [`runs/`](runs/).

**Local numbers are local.** A Mac run proves the harness works, finds
regressions and prices the code in statements and reads. It does not say
what a production platform can carry. Only CAP-08 runs on a production-class
target can say that.

## The harness

`pnpm measure:api` from `apps/questura/apps/server`
(`scripts/measure-public-api.ts`, pure modules in `scripts/measure/`).

| Flag | Default | Meaning |
|---|---|---|
| `--scenario` | `public-api` | A file in `scripts/measure/scenarios/`. |
| `--mode` | `closed` | `closed`: callers wait for answers. `arrival`: iterations start on a schedule whatever the server does. |
| `--cache` | `warm` | `warm`: `--warmup` unmeasured requests per step first. `cold`: no warmup; every request is measured. |
| `--runs` / `--concurrent` | 10 / 1 | Closed mode: rounds per step, requests per round. |
| `--warmup` | 1 | Unmeasured requests per step before measuring. |
| `--rate` / `--duration` | 5 / 30 | Arrival mode: iterations per second, seconds. |
| `--max-in-flight` | 200 | Arrival mode: iterations in flight before arrivals are dropped (and counted). |
| `--timeout-ms` | 15000 | Per-request deadline, covering the body. |
| `--abort-error-rate` / `--abort-min-samples` | 1 (off) / 50 | Stop once the trailing-60 s failure share exceeds this. Use `0.01` for escalating runs. |
| `--json` / `--html` / `--label` | | Evidence files and a free-text note. |

Every response gets exactly one outcome: `ok`, `throttled` (429),
`client-error`, `server-error`, `invalid-body` (right status, wrong content),
`timeout`, `transport`. Latency percentiles are **`ok` only**. Diagnostics the
server did not send print as `-`, never 0. The exit code is 2 when a run
aborted or nothing succeeded, 64 on a bad flag.

Set `DB_STATS_SECRET` in the harness's environment (same value as the server)
to sample `/api/internal/db-stats` once a second: max pool `waiting` and total
across the run. It sees one process only.

### Scenarios

| Scenario | Use |
|---|---|
| `public-api` | Each anonymous backend read a city page needs, one at a time. Closed mode. |
| `cold-content` | Heavy reads over distinct URLs. `--cache cold` on a fresh server, or arrival mode. |
| `identity` | `/api/me` with no cookie, a malformed cookie, an unknown cookie. |
| `hot-pages` | Frontend HTML for three landing pages, one request per iteration. Arrival headroom. |
| `campaign-reader` | Two pages per visit, 90 s apart, each followed by the identity check. Reader sessions. |

Frontend scenarios need `--client`. Assets, images, RSC prefetch and
third-party requests are not in any scenario; measure them in a real browser.

### k6

`k6` is installed on the Mac (approved 2026-09-21) for runs that need more
arrivals than one Node process can generate. `apps/questura/load/k6/` holds
the target-platform scripts, one per CAP-08 row
([`cap08-proof-matrix.md`](cap08-proof-matrix.md)). A local smoke run:

```bash
k6 run -e CLIENT_URL=http://localhost:3100 -e BASE_URL=http://localhost:4100 \
  -e ORIGIN=https://capacity-client.invalid -e SCALE=0.05 -e TIME_SCALE=0.02 \
  apps/questura/load/k6/campaign-readers.js
```

Every k6 run names a workload manifest and refuses to start without one.
The local readiness sandbox, the manifests, the rolling-window abort
supervisor and the negative controls that prove each gate can fail are in
[`local-readiness.md`](local-readiness.md).

The Node harness is the source of truth for correctness classification; k6
is for volume.

## A production build on the Mac, beside `pnpm dev`

`next dev` timings are never evidence. Build into a separate directory and
start on other ports so a running dev session is untouched:

```bash
# once: a throwaway local Redis (production mode requires one)
redis-server --port 6390 --bind 127.0.0.1 --save '' --appendonly no --daemonize yes

cd apps/questura/apps/server
source scripts/measure/local-prod-env.sh   # before the build too: it needs REDIS_URL
NEXT_DIST_DIR=.next-capacity pnpm build
git checkout -- tsconfig.json   # the build rewrites its include list
```

Production mode refuses to boot on development URLs. `scripts/measure/local-prod-env.sh`
supplies the minimum non-secret overrides for a **read-only** local run
(non-localhost URL placeholders, local Redis, `TRUSTED_PROXY`, cookie domain).
It never touches Stripe, email or Bunny configuration beyond what `.env`
already has — do not exercise checkout, sign-up or uploads against it.

```bash
NEXT_DIST_DIR=.next-capacity pnpm exec next start -p 4100
pnpm measure:api -- --base http://localhost:4100 --json ../../docs/capacity/runs/<date>-<name>.json
```

The client builds the same way (`NEXT_DIST_DIR=.next-capacity`,
`NEXT_PUBLIC_BACKEND_URL=http://localhost:4100`, `next start -p 3100`) —
**but the backend has to be running first.** The client build pre-renders
every public URL (PR #604) and fails with `Could not read public URLs from
…/api/public/sitemap-entries` if nothing answers. Build the server, start it
on 4100, then build the client.

Both builds rewrite their `tsconfig.json` include list. `git checkout -- tsconfig.json`
in each app afterwards.

## The readiness harnesses that need those builds

Four of the readiness scripts drive real production processes rather than a
Payload instance, and they all expect `.next-readiness` (the default; override
with `NEXT_DIST_DIR`) plus a Redis on 6390.

```bash
cd apps/questura/apps/server
export READINESS_DATABASE_URI="postgres://$USER@127.0.0.1:5432/questura_readiness_scratch"

pnpm readiness:fanout            # L03: fan-out cost at 250 → 16,000 articles
pnpm readiness:serving           # L12: two serving processes behind a proxy
pnpm readiness:frontend-cache    # L05: the page a reader actually gets
pnpm readiness:corpus -- build large    # L14: a deterministic synthetic corpus
pnpm readiness:corpus-baseline   # L14: the same reads at three corpus sizes
```

`readiness:serving` owns 4100/4101/4102 and `readiness:frontend-cache` owns
4100/3100; both refuse to start if a port is already serving, because a
leftover process from a crashed run otherwise gets measured in place of the
one the script started.

`readiness:corpus-baseline` needs a backend already running on 4100 — it
rebuilds the corpus between measurements and drives the existing
`scripts/measure` harness against it.

## Prewarming campaign pages

```bash
pnpm prewarm:campaign -- --client https://www.questurian.com --urls ../../docs/capacity/campaign-urls.txt --concurrency 2
```

Each URL is rendered once, then fetched again to see whether the cache
answered. Bounded (≤ 8 at a time, one pass). Exit 2 if any URL failed.

## What to record

Each run in `runs/` gets its JSON plus a line in `STATUS.md`: SHA, mode,
build, dataset counts, cache state, offered/completed/dropped, `ok`
percentiles, every failure class, and what the run can and cannot claim.
No secrets, cookies or personal data in committed evidence.
