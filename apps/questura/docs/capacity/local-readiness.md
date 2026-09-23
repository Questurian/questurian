# Local readiness harness

The sandbox and the proof harness the sixteen local-readiness tasks run
inside (`docs/capacity/local-readiness-plan.html`). Two pieces:

- **The sandbox** — `apps/server/scripts/readiness/`. A disposable Postgres
  database, a namespaced Redis, a faultable frontend receiver and a manifest.
- **The proof harness** — `load/k6/`. The CAP-08 scripts, plus the negative
  controls that show each gate can fail.

## The sandbox

```bash
cd apps/questura/apps/server
pnpm readiness check     # preflight only: says what it would use, touches nothing
pnpm readiness up        # creates the disposable database and writes the manifest
pnpm readiness down      # drops it
```

Defaults, all overridable, all still checked by preflight:

| Thing | Default | Why not the obvious one |
|---|---|---|
| Database | `questura_readiness` @ 127.0.0.1:5432 | `google-login` on the same host is the owner's scratch data and is one word away. |
| Redis | `redis://127.0.0.1:6390`, keys under `readiness:` | 6379 may be something else; a namespace means a flush cannot reach it. |
| Frontend receiver | `http://127.0.0.1:3100` | 3000 is what the owner has open in a browser. |
| Backend | `http://127.0.0.1:4100` | 4000 likewise. |

**Preflight refuses, it does not warn** (`scripts/readiness/preflight.ts`):

- a database name not on the disposable allowlist;
- any host that is not loopback;
- a sandbox process on a development port;
- a live *or test* Stripe key anywhere in the environment, matched on the
  value's shape rather than the variable's name;
- a Bunny, Resend or Maps key — a readiness run must not be able to make a
  paid call.

Child processes get `sandboxEnv()`, which **deletes** those variables rather
than blanking them: an empty string still satisfies some `?? ''` reads, while
an absent variable makes the feature that needs it refuse. The production
apps started by `apps.ts` are different: `next` loads `.env*` itself and would
refill a deleted name, so there every name the files define is blanked.

The manifest (`docs/capacity/runs/readiness-sandbox.json`) records the source
SHA, a fingerprint of the uncommitted diff when the tree is dirty, Node and
platform, dataset identity, seed, ports and what cleanup owns. Connection
strings are stored with credentials stripped.

### The full stack, from a clean checkout (surge plan L00/L01)

```bash
cd apps/questura/apps/server
pnpm readiness bootstrap                     # schema fixture + payload migrate; no developer database
pnpm readiness:launch -- seed                # the ~50-article launch corpus and synthetic readers
pnpm readiness:stack -- up --build           # Redis 6390, media 3190, Stripe stub 3191, backend 4100, client 3100
pnpm readiness:routes                        # 114 real-route checks: identity, isolation, credential matrix
pnpm readiness:stack -- down                 # stops only what `up` started
```

After a reseed, rebuild the client (`up --build-client`): its pages are
pre-rendered from the backend at build time.

- **Isolation is enforced**: every sandbox process loads
  `scripts/readiness/deny-outbound.cjs` (non-loopback connections fail and are
  logged to the run's `outbound.log`); every `.env*` name the harness does not
  set is blanked (`sandbox-env.ts`); processes bind 127.0.0.1; a dedicated
  Redis is used because Better Auth's session keys ignore `REDIS_KEY_PREFIX`.
- **Browser origins** are `http://app.readiness.localhost:3100` and
  `http://api.readiness.localhost:4100` — loopback by definition, a secure
  context in browsers, and accepted by the production origin guard without
  relaxing it.
- **State** (pids, generated secrets, logs) lives in
  `$TMPDIR/questura-readiness/`, mode 0700, never in the repository.
- **Expected values** live in `load/k6/manifests/launch-v1.json`; scripts read
  it rather than repeating markers.

Evidence and findings: `runs/2026-09-22-surge-L00-L03-sandbox-and-routes.md`.

### Integration tests

Tests under `scripts/readiness/*.integration.test.ts` use **separate real
connections**, never one transaction on one connection. They skip themselves
when no disposable Postgres is reachable, so CI stays green — which means a
green CI run is *not* evidence that they passed. The recorded run in
`runs/` is.

## The proof harness

### Workload manifests

Every k6 run names a manifest (`load/k6/workloads/*.json`, `WORKLOAD=`). The
manifest states, per URL, the exact status, a content marker identifying the
page and its revision, a redirect's exact destination, whether the response
may be cached, and what `/api/me` must report for anonymous and signed-in
callers. Without one, the scripts refuse to start.

This replaces checks that accepted any HTML, any 200/307/308 and any boolean
identity — all three of which are true of a backend serving the wrong
article to the wrong reader.

### The stop controller (surge plan L08)

k6 thresholds are cumulative over the whole run, and they cannot see a wrong
page that answered 200, a queue growing inside the server, or telemetry that
went quiet. `supervise.mjs` is the stop controller; its rules live in
`supervisor/policy.mjs` (unit-tested in `supervisor/policy.test.mjs`).

```bash
TELEMETRY_INSTANCES=readiness-stack-backend=http://127.0.0.1:4100/api/internal/db-stats \
DB_STATS_SECRET=<from the stack state> RUN_KIND=capacity SUCCESS_FLOOR_RPS=10 \
WORKLOAD=$PWD/load/k6/workloads/launch-local.json SESSIONS_FILE=<pnpm readiness:sessions> \
node load/k6/supervise.mjs load/k6/launch-journeys.js -- -e RATE=15
```

| Exit | Stop reason |
|---|---|
| 64 | a setting refused before anything starts (every abort parameter is validated) |
| 90 | rolling-window HTTP failure rate (not in `containment` runs, which expect refusals) |
| 91 | correctness: `questura_correctness{class}` — wrong 200 body, leaked member marker, false identity, a cacheable private response, a refusal without `Retry-After` |
| 92 | sustained queue growth on **one** instance (pools + every gate queue), never a fleet average; a drain to zero clears its history |
| 93 | telemetry missing, stale, from an undeclared endpoint, answering as a different instance, duplicated, or an instance restarted |
| 94 | wall-clock or request budget spent |
| 95 | the generator dropped arrivals (capacity and containment runs) |
| 97 | a `capacity` run ended below its declared successful-throughput floor — an all-503 run cannot pass |

Telemetry is polled from each declared instance directly, never through a
balancer. Run kinds: `correctness` (default, no capacity claim), `capacity`
(open arrivals, success floor required), `containment` (deliberate overload:
refusals reported separately, correctness and resources still stop it). The
summary (`SUPERVISOR_SUMMARY`) keeps offered, successful and refused counts
and fractions apart. k6 is stopped with SIGINT, then SIGKILL after
`ABORT_GRACE_MS`.

The launch workload (`workloads/launch-local.json`) is generated from the
corpus manifest by `lib/build-launch-workload.mjs`; sessions come from
`pnpm readiness:sessions` (a 0600 file in the stack's state directory, never
committed). `launch-journeys.js` models browser-informed visits (free and
gated landings, repeat visits, search, saved items, bookmark writes, sign-in)
with exact identity, bookmark and member-body checks, distinct sessions and a
synthetic client address per VU.

### Negative controls

```bash
node load/k6/negative-control/run.mjs
```

Starts a loopback target in each fault mode and requires k6 to exit nonzero.
Twenty-eight controls. The twelve supervisor controls run the supervisor
itself against a target broken one way at a time and require the exact exit
code, the matching reason and a bounded stop: wrong 200 body, leaked member
marker, lying identity, cacheable private response, refusal without
`Retry-After` (all 91), queue growth (92), missing telemetry and a stranger
answering (93), an invalid abort setting (64), an all-503 run claimed as
capacity (97), a saturated generator (95) — and a benign short spike that must
**not** stop the run. The original sixteen: eight response faults (wrong content, wrong redirect,
identity that lies, a member's body served to an anonymous reader, a
cacheable private response, a cacheable response carrying `Set-Cookie`, a
throttled reader) and eight settings that must be refused before load starts
(`SCALE=abc`, `SCALE=0`, `TIME_SCALE=-1`, no manifest, empty URL list, a path
without a leading slash, a signed-in share with no session cookie, a cold
corpus too small to be cold).

A control that comes back green is a gate that does not check what it claims.
