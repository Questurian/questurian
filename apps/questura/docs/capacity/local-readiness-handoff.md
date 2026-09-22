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
| L03 fan-out | locally verified | 15 unit tests; no large-corpus memory measurement |
| L04 worker lifecycle | locally verified | live boot on the production build (L14 run) |
| L05 publish chain | **locally verified, one half owed** | 24/24; the frontend page cache is not covered |
| L06 mount bounds | locally verified | live probes in `runs/2026-09-22-L14-readiness-baseline.md` |
| L07 aggregate bounds | locally verified | unit tests + `ingress.admitted 99 / private.admitted 0` live |
| L08 cache contract | locally verified, narrowed | `cache-contract.md`; the full-route cache limit is H03 |
| L09 Cloudflare adapter | **locally verified** (dependency approved 22 Sep) | `runs/2026-09-22-L09-cloudflare-adapter.md` |
| L10 fleet contract | locally verified | 53 database tests |
| L11 per-instance evidence | locally verified | live `db-stats` sample in the L14 run |
| L12 multi-process | **locally verified, one half owed** | `runs/2026-09-22-L12-fleet-rehearsal.md` |
| L13 proof gates | locally verified | `runs/2026-09-22-L13-negative-controls.md`, 16/16 |
| L14 baseline | locally verified, corpus small | `runs/2026-09-22-L14-readiness-baseline.md` |
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
```

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

| Owed | What it needs |
|---|---|
| **L05 frontend cache half** | Two production-mode processes (client + server). Whether `revalidateTag` produces the new page, whether a negative cache clears on first publish, whether an access change stops a warm cache serving a member body. On Cloudflare this is a *different* cache, so the local version is a lower bound on the question, not an answer. |
| **L12 serving half** | Two serving processes behind a loopback proxy: routing fairness, skewed routing, a rolling release under HTTP traffic, termination grace, and Redis counters shared while local gates stay per process. |
| **L14 representative corpus** | Deterministic small/medium/large corpora, valid-session load, publish-during-load, browser assets, sustained fault recovery. The 25-article copy is a regression baseline, not a workload. |
| **L03 fan-out memory** | Target discovery measured against a synthetic author with thousands of articles. |

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

The next thing that needs a human decision, in order:

1. ~~Approve `@opennextjs/cloudflare`~~ — **done 22 September.** The Worker
   builds, serves the real site locally, and completes a full cache hit →
   publish → new content cycle. `runs/2026-09-22-L09-cloudflare-adapter.md`.
2. ~~Confirm the L01 publication policy~~ — **confirmed 22 September.** Saves
   fail loudly when the refresh obligation cannot be written.
3. **Decide the fallback trade in `cache-contract.md`** — whether a cold
   Workers isolate failing loudly is acceptable, or whether curated pages need
   shared fallback storage. Still open, and it should be decided from hosted
   numbers rather than from the fact that the storage product exists. It
   blocks nothing today.
4. **H01: provision the target.** This is now the next real step — an R2
   bucket, a D1 database, the Durable Objects and a Cloudflare API token
   scoped to Cache Purge, plus Railway and Neon. Every placeholder is named in
   `apps/client/wrangler.jsonc` and `apps/client/cloudflare/README.md`.
