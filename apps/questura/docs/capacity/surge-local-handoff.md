# Surge hardening — local handoff

The local half of [`local-surge-implementation-plan-2026-09-22.html`](local-surge-implementation-plan-2026-09-22.html),
done 2026-09-22/23 in eight PRs, each merged into `main` after green CI. It
answers the [discovery report](external-video-surge-discovery-2026-09-22.html)
finding by finding. The historical reports are left as written; this file is
the status.

**Allowed claim:** local resource controls and correctness gates are
implemented and reproducibly verified for the recorded scenarios.

**Not claimed:** hosted sustainable throughput, 10×–100× campaign tolerance,
global cache propagation, real-domain authentication, bounded provider spend.
Nothing was deployed, provisioned or billed; no live or test Stripe call, no
OAuth, no email, no Bunny, no Maps.

## The PRs

| PR | Plan package | What it did |
|---|---|---|
| [#636](https://github.com/Questurian/questurian/pull/636) | L02 L04 L07 | fake credentials no longer bypass the Payload mount; budgets count real rollouts; the fallback byte ceiling is hard |
| [#637](https://github.com/Questurian/questurian/pull/637) | L03 | every costly account route admitted, fair, and never "signed out" on a dependency failure |
| [#638](https://github.com/Questurian/questurian/pull/638) | L06 | refresh jobs claimed just in time, with a deadline inside the lease |
| [#639](https://github.com/Questurian/questurian/pull/639) | L05 | client: status-first errors, finite jittered retries, one shared identity lookup, honest error states |
| [#640](https://github.com/Questurian/questurian/pull/640) | L00 L01 | enforced-loopback sandbox, schema fixture, fifty-article launch corpus, real-route proof |
| [#641](https://github.com/Questurian/questurian/pull/641) | L08 | stop controller with exact reasons; launch workload with exact checks |
| [#642](https://github.com/Questurian/questurian/pull/642) | L09 | publication by permitted states, restored-service gate, required-integration CI job, adapter by revision |
| [#643](https://github.com/Questurian/questurian/pull/643) | L10 | finite local runs and the harness fixes they forced |

## Discovery findings, by number

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | A fake credential bypasses Payload mount protections | **Fixed, locally verified.** Callers classified by `payload.auth` in a bounded gate; unverified credentials get the anonymous policy with the credential stripped; GraphQL refuses before parsing; the disguised POST read is bounded. Hosted: alternate-ingress and header-spoof checks still owed. | `mount-bounds.test.ts`; 69-check real credential matrix in `runs/2026-09-22-surge-routes.json` |
| 2 | Account traffic escapes the admission budget | **Fixed, locally verified.** One order for every costly account route; pre-auth session/address guard; `auth` gate for password work. Production limit *values* remain unmeasured. | `account-admission.md`, `private-routes.test.ts`, L10 320/s run |
| 3 | Database budget undercounts a rollout or a fleet | **Fixed.** Zero/overflow counts refused; worst rollout state enumerated; pooled components or a conservative legacy total. Hosted enforcement of process counts still owed. | `pool-budget.test.ts`, `fleet-manifest.test.ts` |
| 4 | Cloudflare protection is only as strong as the origin boundary | **Hosted-only.** Nothing local can settle it. | H02 |
| 5 | Search and shared-IP limits can reject readers | **Partly fixed.** Search carries the render token and says "busy" instead of "No results". Shared-IP limits quantified locally (see L10 findings); the policy decision is open. | `searchUnavailableIsNotEmpty.test.mjs`, L10 |
| 6 | Cold caches and failed refreshes have no fleet-wide net | **Hosted decision, unchanged.** Three clocks documented; one adapter defect found (below). | `cache-contract.md`, L09 adapter |
| 7 | Failures multiply requests and look like lost membership | **Fixed, locally verified.** Status-first errors, deadlines, cancellation, finite jittered retries; one shared `/api/me`; "couldn't check your access" instead of the paywall; bookmark "unknown" ≠ signed out; no CORS preflight on GETs. Physical in-app browsers still owed. | client tests; L10 browser capture |
| 8 | Refresh jobs spend their lease waiting | **Fixed, locally verified.** | `runs/2026-09-22-surge-L06-refresh-claims.md` |
| 9 | Fallback memory ceiling is soft | **Fixed.** UTF-8 JSON byte accounting; oversize refused before eviction. | `lastGood.test.mjs` |
| 10 | Load-test stops cannot establish bounded cost | **Fixed locally.** Exact stop reasons, per-instance telemetry, 28 negative controls. A provider spending cap is still owed. | `runs/2026-09-22-surge-L08-stop-controls.md` |
| 11 | Passing rehearsals do not cover the visitor or restored service | **Fixed locally.** Exact identity/content checks, per-path publication convergence, restored-service gate, CI integrations that cannot skip. | `runs/2026-09-22-surge-L09-publication-restore-ci.md` |

## Acceptance checklist

- [x] **L00** isolated services, effective env, outbound boundary — [sandbox and routes](runs/2026-09-22-surge-L00-L03-sandbox-and-routes.md)
- [x] **L01** reproducible schema, fifty articles, real synthetic sessions from a clean checkout — same file; CI job *Questura readiness integrations*
- [x] **L02** invalid credentials cannot bypass REST, global or GraphQL controls — [routes JSON](runs/2026-09-22-surge-routes.json)
- [x] **L03** costly account routes bounded; no-cookie identity 0 SQL; fairness tested — [account-admission.md](account-admission.md)
- [x] **L04** safe process parsing, conservative heterogeneous rollouts — tests in #636
- [x] **L05** shared identity, honest errors, finite retries, cancellation — tests in #639; [L10 browser capture](runs/2026-09-22-surge-L10-local-runs.md)
- [x] **L06** just-in-time claims, fenced recovery, shutdown — [L06](runs/2026-09-22-surge-L06-refresh-claims.md)
- [x] **L07** hard byte ceiling; cache-layer limits documented — [cache-contract.md](cache-contract.md)
- [x] **L08** telemetry feeds every stop; negative controls prove failure — [L08](runs/2026-09-22-surge-L08-stop-controls.md)
- [x] **L09** publication, restore, required integrations, adapter preview — [L09](runs/2026-09-22-surge-L09-publication-restore-ci.md)
- [x] **L10** finite scenarios recorded honestly, including what was not run — [L10](runs/2026-09-22-surge-L10-local-runs.md)
- [x] **L11** this file; runbook in [local-readiness.md](local-readiness.md); variables in [local-readiness-handoff.md](local-readiness-handoff.md)

Scope notes, stated rather than hidden: 100× arrivals were **not run** (the
Mac was at its admission limits at 320/s); no soak; no signed-in browser
capture (signed-in journeys are covered at the HTTP level with real
sessions); maps have no members-only format by product design, so gated
examples exist for articles and itineraries only.

## Test counts at the end

Server 1,805 (vitest, full). Client 245 (node:test). Readiness integrations
55 with 0 skipped (local and CI). Supervisor policy 23. Negative controls 28.
Route checks 114. Restore 35. Publication 11 standalone, 9 under load.
Adapter 13. Server `tsc`: only the two `vitest.config.ts` errors that predate
this work.

## Reproduce from a clean checkout

```bash
cd apps/questura/apps/server
pnpm readiness check && pnpm readiness bootstrap && pnpm readiness:launch -- seed
pnpm readiness:stack -- up --build
pnpm readiness:routes && pnpm readiness:restore && pnpm readiness:required
pnpm readiness:adapter          # moves one article to its next revision
pnpm readiness:publication      # mutates the corpus: reseed, then up --build-client
node ../../load/k6/negative-control/run.mjs
node ../../load/k6/runs/local-matrix.mjs calibrate plateau-10   # or any scenario
pnpm readiness:stack -- down
```

Prerequisites: Node 22+, pnpm, PostgreSQL client tools and a local server
(any version ≥ 14), `redis-server`, k6. Nothing else is downloaded.

## Findings to carry into hosting

1. **`@opennextjs/cloudflare@1.18.1` cache-purge Durable Object bug.**
   `BucketCachePurge.alarm()` passes the tag array to `sql.exec` as one
   binding; with more than one tag (every article save has four) it throws
   "Wrong number of parameter bindings" and retries. Patch or upgrade before
   relying on DO purge. (L09)
2. **The Worker renders from the backend URL inlined at build.** Hosted
   builds must inline a backend origin the Worker can reach. (L09)
3. **Per-address limits are tight for shared networks**: 30 member bodies/min
   and 60 public reads/min per address. Decide from real NAT/carrier traffic;
   keep render misses on the render token. (L10)
4. **Sign-in depends on Redis**; public reading does not. (L10)
5. **Member-body DB errors are 500s**, not 503s; the client treats both as
   temporary, but the status could be more honest. (L10)
6. **Better Auth session keys ignore `REDIS_KEY_PREFIX`.** A shared Redis is
   not isolated by prefix. (L00)
7. **`.env` files fill anything a launcher does not set**, including
   `NEXT_PUBLIC_*` values a build inlines into browser JavaScript. Hosted
   builds should be made from an explicit environment. (L00)
8. **Empty storage host** makes the storage adapter write `https:///media/…`
   instead of no image. (L10)

## What the next hosted person receives

- **Ingress:** the credential/header policy is tested at the application;
  the routes and hostnames needing real origin restriction and proxy
  attribution proof are H02.
- **Cache:** exact per-path assertions (`publication-states.ts`), the adapter
  smoke, the three-clocks note; cold isolates, global purge and finding 1 are
  owed.
- **Fleet:** budget inputs and formulas, gate metrics per instance
  (`db-stats`), the per-instance supervisor; provider limits unknown.
- **Browser:** the request map above and the error states; physical in-app
  browsers, real OAuth, cookies and challenges owed.
- **Recovery:** the restored-service gate and worker replay; managed
  backup/PITR and real termination owed.
- **Cost:** per-request counts and a stop controller that stops for the right
  reasons; real Worker CPU, R2/D1/DO, backend/DB/Redis, email and Bunny costs
  and an owner-approved budget owed.
