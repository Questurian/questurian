# Local readiness: handoff

*22 September 2026. Written to be followed from a fresh context using only
repository paths, this file and `local-readiness-plan.html`.*

Sixteen local tasks (L00–L15) and six hosted gates (H01–H06). This says what
each task's state actually is, what evidence exists, and what the next
authorized operation is.

**Local completion permits requesting a hosted-test phase. It is not campaign
launch approval, and nothing here is a capacity claim.**

## Where things stand

| Task | State | Evidence |
|---|---|---|
| L00 sandbox | locally verified | `runs/readiness-sandbox.json`, 26 readiness tests |
| L01 publication atomicity | locally verified | `runs/2026-09-22-L05-publish-end-to-end.md` |
| L02 worker fencing | locally verified | `runs/2026-09-22-L02-worker-fencing.md` |
| L03 fan-out | locally verified, **measured** | 15 unit tests + `runs/2026-09-22-L03-fanout-memory.md` (6/6) |
| L04 worker lifecycle | locally verified | live boot on the production build (L14 run) |
| L05 publish chain | locally verified, **both halves** | 24/24 + `runs/2026-09-22-L05-frontend-cache.md` (12/12) |
| L06 mount bounds | locally verified | live probes in `runs/2026-09-22-L14-readiness-baseline.md` |
| L07 aggregate bounds | locally verified | unit tests + `ingress.admitted 99 / private.admitted 0` live |
| L08 cache contract | locally verified, narrowed | `cache-contract.md`; the full-route cache limit is H03 |
| L09 Cloudflare adapter | **locally verified** (dependency approved 22 Sep) | `runs/2026-09-22-L09-cloudflare-adapter.md` |
| L10 fleet contract | locally verified | 53 database tests |
| L11 per-instance evidence | locally verified | live `db-stats` sample in the L14 run |
| L12 multi-process | locally verified, **both halves** | `runs/2026-09-22-L12-fleet-rehearsal.md` + `runs/2026-09-22-L12-serving-fleet.md` (10/10) |
| L13 proof gates | locally verified | `runs/2026-09-22-L13-negative-controls.md`, 16/16 |
| L14 baseline | corpus + publish-under-load done; three items deliberately skipped | `runs/2026-09-22-L14-readiness-baseline.md`, `runs/2026-09-22-L14-corpus-baseline.md` (6/6), `runs/2026-09-22-L14-publish-under-load.md` (8/8) |
| L15 handoff | this file | `pnpm readiness:restore`, 10/10 |

## Running any of it

From `apps/questura/apps/server`:

```bash
pnpm readiness check        # preflight only; touches nothing
pnpm readiness up           # create the disposable database
pnpm readiness copy-from google-login   # a working copy with a real schema
pnpm readiness:publish      # L05: the publishing chain end to end
pnpm readiness:fleet        # L12: two real processes, one database
pnpm readiness:restore      # L15: dump and restore, with obligations
pnpm readiness:collect -- http://127.0.0.1:4100   # L11: per-process sampling

pnpm readiness:fanout           # L03: fan-out cost at four career sizes
pnpm readiness:serving          # L12: two serving processes behind a proxy
pnpm readiness:frontend-cache   # L05: the page a reader actually gets
pnpm readiness:corpus -- build large   # L14: a deterministic synthetic corpus
pnpm readiness:corpus-baseline  # L14: the same reads at three corpus sizes
pnpm readiness:publish-under-load  # L14: publishing while people are reading
```

The last four need a production build in `.next-readiness` for both apps and
a Redis on 6390 — `docs/capacity/README.md` has the recipe. Build the client
**after** starting the backend: its build pre-renders every public URL and
fails if the backend is down.

From `apps/questura`:

```bash
node load/k6/negative-control/run.mjs   # L13: 16 controls
node load/k6/supervise.mjs <script.js>  # the rolling-window abort
```

Preflight refuses any database not on the three-name disposable allowlist,
any non-loopback host, a sandbox process on a development port, and any live
or test Stripe key in the environment.

## Four findings that outlive this work

**1. A fresh database cannot be built from the migration chain.**
`pnpm db:migrate` against an empty database fails in the earliest migration,
which assumes tables predating the chain. The committed migrations are a
forward series from a mid-life snapshot, not a schema from zero. **The first
database in any new hosted environment has to come from a dump.** This is an
H01 provisioning constraint, and it is why `readiness copy-from` exists.

**2. A rolling deploy of the fencing migration is not safe by itself.** A
process on the previous release completes refresh jobs with `id + status =
'running'` and no claim token, so while old and new overlap an old worker can
still finish a new worker's claim. Not worse than before the migration, but
not fixed for the length of the overlap. The transition must stop the drains:
`REFRESH_WORKER_INTERVAL_MS=0` on the old generation, let in-flight claims
finish or leases expire, migrate, deploy, re-enable. Recorded in
`20260922_063804_refresh_jobs_fencing.ts` itself.

**3. CI did not run a production build, and a build-breaking change passed
every other gate.** L04's rewrite of `instrumentation.ts` used an early
return instead of a `NEXT_RUNTIME === 'nodejs'` block; Next eliminates that
block statically for the edge bundle, and the early return left Payload's
config reachable from it. Tests, typecheck and lint were all green. A
`Questura server build` job now runs in CI.

**4. All four OpenNext cache components are required, not optional.** Without
the tag cache `revalidateTag` resolves to nothing; without cache purge it
updates the incremental cache while the CDN serves the old page. Either way
the refresh queue drains clean and the site stays stale — the exact failure
L01 removed from the backend, one layer up. Declaring the binding is not
enough; `cachePurge` must be wired in `open-next.config.ts` too, and a
configuration with the binding and no override builds, starts, serves and
does not purge.

**5. Next 15.4.11 pins the Cloudflare adapter at 1.18.1.** Adapter 1.19.0
raises its Next floor to 15.5.15 and `@latest` wants 15.5.24. Both pins are
exact so a routine install cannot cross that boundary silently. Going further
means a Next minor upgrade across both apps — a separate decision.

**6. The adapter build collides with `pnpm dev`.** The client dev server
writes turbopack artifacts into `.next`; the adapter bundles from `.next` and
ignores `NEXT_DIST_DIR`. Build in a git worktree, or stop the dev server.

## What is owed locally, and what it would take

Four halves were owed on 22 September. Three are closed and one is partly
closed; what is left is listed honestly rather than rounded up.

| Was owed | State |
|---|---|
| **L05 frontend cache half** | **Done.** 12/12. A publish produces the new page, a negative cache clears on first publish, and an access change is not served from a warm cache. On Cloudflare this is a different cache, so it bounds H03 from below rather than answering it. |
| **L12 serving half** | **Done.** 10/10. Routing fairness, skewed routing, a rolling release under traffic, termination grace, and the split between per-process gates and the fleet-wide Redis budget. |
| **L03 fan-out memory** | **Done.** 6/6. Memory is not the problem; **481 sequential delivery requests for one save at 16,000 articles** is. |
| **L14 representative corpus** | **Mostly done.** The deterministic corpus exists (small / medium / large, up to 8,000 published articles across 200 cities), the same reads are measured at all three sizes, and publishing-during-load is proven (8/8). **Still owed, deliberately not done:** valid-session load, browser assets, sustained fault recovery — see below. |

### What was deliberately not done, and why

The owner chose publishing-under-load and stopped there. The other three L14
items are **not** done and are not claimed:

| Skipped | Why |
|---|---|
| **Valid-session load** | Needs minting a genuine Better Auth session against the sandbox. Real work with real risk of time spent on auth internals, and the anonymous identity path is already covered by the `identity` scenario. |
| **Browser assets** | Overlaps the image width ladder and the perf sweep (PRs #564, #590–#598), which measured page weight against the real client already. |
| **Sustained fault recovery** | Killing Redis and dropping database connections under load. Genuinely valuable, genuinely not done. Safe to do locally whenever it is wanted: the sandbox Redis is disposable and only the scratch database's connections would be dropped. |

### The four findings those runs produced

1. **The author fan-out's cost is delivery, not memory.** 16,000 published
   articles is a 7.1 MB target and a 71.8 MB peak — both small — but **481
   sequential HTTP requests** to the frontend for one save. Nothing had
   counted them.
2. **The sitemap is the read that will be uncomfortable first.** At 8,000
   published articles: 859 KB, p95 394ms. It is a size problem, not a query
   problem — the corpus grew 333× and no read's statement count grew more
   than 2.2×, so nothing in the public API is a per-row round trip.
3. **A real city page issues 171 statements** whatever the corpus holds. That
   is the control in the L14 run and it is stable, which is what makes the
   comparison valid — and it is a standing item of its own.
4. **Publishing costs readers about 20% of p95 and 14% of throughput**, and
   costs them nothing in correctness: across 11,686 reads during eight
   publishes, every page was exactly one version of itself and 7,060 of them
   carried the new one.

## Configuration a deployment must now state

New since this series. Production refuses to boot without the required ones.

| Variable | Required | What it decides |
|---|---|---|
| `QUESTURA_CLIENT_URL` | **yes** | where publications are delivered |
| `QUESTURA_REVALIDATION_SECRET` | **yes** | must match the frontend's |
| `REFRESH_OUTBOX_DEGRADED_ACK` | only with `REFRESH_OUTBOX=off` | acknowledges known data loss |
| `REFRESH_DISCONNECTED` | must be unset | development only |
| `APP_REPLICA_COUNT` × `APP_PROCESSES_PER_REPLICA` | optional | processes, not containers |
| `APP_PREVIOUS_PER_PROCESS_CONNECTIONS` | optional | the old generation's ceiling during a rollout |
| `DATABASE_TOPOLOGY` | optional | `direct` or `pooled`, checked against the URI |
| `PUBLIC_INGRESS_*`, `PRIVATE_READ_*` | optional | the two new gates |
| `QUESTURA_INSTANCE_ID` | optional | a stable identity for the collector |
| `BOOT_FAIL_FAST` | optional | crash instead of retrying initialisation |
| `REFRESH_WORKER_SECRET` | for a scheduler | `POST /api/internal/refresh-jobs` |

## The hosted gates, unchanged and unchecked

H01 provision · H02 ingress and cookies · H03 cache semantics · H04 fleet and
job envelope · H05 recovery and payment readiness · H06 CAP-08 with a spend
cap. All six still require the owner's budget, instance cap, campaign URLs
and recovery targets, none of which this work decided.

## The next authorized operation

**Nothing billed, nothing provisioned, nothing deployed.**

The local work is as complete as local work can be. What is left needs either
the owner's decision or a hosted environment:

1. **H01: provision the target.** The click-by-click list is
   [`h01-provisioning-checklist.md`](h01-provisioning-checklist.md) — Neon,
   then Railway, then Cloudflare, with the four checks that catch a
   provisioning mistake that otherwise looks like success. Reading it costs
   nothing; step 1 starts spending money. **This is the owner's, and only
   when he decides to start.**
2. **Decide the fallback trade in `cache-contract.md`** — whether a cold
   Workers isolate failing loudly is acceptable, or whether curated pages need
   shared fallback storage. Still open, and better decided from hosted
   numbers. It blocks nothing.
3. **The rest of L14**, if more local work is wanted before provisioning:
   valid-session load, browser assets, sustained fault recovery. The corpus
   and the two-app harness they would need already exist, so each is a
   smaller job than it was. Publishing-during-load is done.

Two earlier decisions were resolved on 22 September: the Cloudflare
dependency was approved, and the L01 "saves fail loudly" policy was confirmed
as shipped.
