# L05 publish chain, end to end — 22 September 2026

`pnpm readiness:publish` (`apps/server/scripts/readiness/publish-e2e.ts`).

Real Payload boot, real Postgres, a real worker on a **separate pool**, a
faultable local receiver standing in for the frontend. Working copy:
`questura_readiness_scratch`, a `pg_dump` of the Mac's development database —
25 articles, 31 locations, 24 search rows. Nothing external contacted; every
paid-service credential deleted from the process before Payload boots; the
Payload and Better Auth secrets are synthetic, so the run cannot decrypt a
stored service-account key or sign a session anything else would accept.

**24/24 checks passed. Run twice from the same state, identical result.**

## What was proven

**The obligation commits with the content.** A save leaves both jobs
committed and visible to a *different connection*, the search job naming the
document and the revalidate job naming the public path — and nothing is
delivered during the save itself.

**First publish, one edit.** The search row is not rewritten by the save. A
worker on another pool finishes the work and the row then holds the new
title. This is the crash-after-commit case: the process that saved never
drained, and another one converged.

**A frontend outage does not become a completed job.** With the receiver
answering 500, the delivery is retried and the obligation stays `pending`.
The search row is still updated, because it does not depend on the frontend.
When the receiver recovers, a later drain delivers the exact revision that
was published during the outage.

**A save whose obligation cannot be written fails.** Injected with a Postgres
`BEFORE INSERT` trigger that raises — a real failed insert inside a real
save, not a mock. The save throws, the error is the one an editor can act on,
**the title rolled back**, and no obligation was left behind.

**A rename invalidates both URLs.** The old canonical path and the new one
both reach the receiver.

**Reference locks still hold.** Unpublishing an article a curated homepage
points at is still rejected, and the rejected unpublish leaves the search row
alone. An unreferenced article unpublishes, loses its search row, and comes
back on one republish with no manual rebuild.

## Failure injection used

| Failure | How |
|---|---|
| frontend refuses | receiver mode `status: 500` |
| outbox unavailable | Postgres `BEFORE INSERT` trigger raising |
| crashed publisher | the saving process never drains; a separate pool does |

## Repeatability

The working copy is built with `pnpm readiness copy-from <source-db>`, which
dumps a database that already has the schema. **`pnpm db:migrate` cannot
build a Questura database from empty** — the earliest committed migration
assumes tables that predate the chain and fails on a fresh database. That is
an L15 restore constraint and an H01 provisioning constraint, not a local
inconvenience: the first database in any new hosted environment has to come
from a dump.

## What this does *not* show

The **frontend page cache**. Everything above ends at "the frontend
acknowledged the invalidation". Whether `revalidateTag`/`revalidatePath` then
produces the new page, whether a negative cache clears on first publish, and
whether an access change stops serving a member-only body to an anonymous
reader from a warm cache — all of that needs two production-mode processes
and is still owed. On Cloudflare it needs the OpenNext adapter's cache
components as well (L09, H03), so the local version of it would be a
different cache from the deployed one.
