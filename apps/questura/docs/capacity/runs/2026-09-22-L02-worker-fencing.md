# L02 worker fencing — 22 September 2026

Mac localhost, Postgres 14.18, disposable database `questura_readiness`,
schema `readiness_fencing`. Separate real connections throughout; no mocks
for anything concurrent.

`npx vitest run --config ./vitest.config.ts scripts/readiness` — **26 pass.**

## What was reproduced before the fix

The claim was `id + status = 'running'`. That is a status check, not
ownership. Two ways it loses:

1. **Lease expiry.** A's lease runs out, B reclaims and sets the row running
   again, A wakes and completes — marking *B's* claim done. B's work is
   dropped and the outbox says everything finished.
2. **A newer save.** A holds a claim, an editor saves again, the row resets
   to pending with the new target, A completes — and the new target is marked
   done without ever being delivered.

Both are now tested with a barrier (`claimOnly` / `completeAs`) rather than
timing.

## What the tests show now

| Test | Result |
|---|---|
| worker overtaken by a newer save cannot complete | stale completion updates 0 rows; row stays `running` under B's token; target is the **new** one |
| worker whose lease expired cannot complete the claim that replaced it | A: 0 rows. B: 1 row, `done` |
| stale completion is superseded, never done | `done` counter unmoved |
| six real jobs drained through the real worker | 6 claimed, 6 done, 0 superseded, receiver saw all six tag sets exactly once |
| frontend answers 500 | 1 retried, 0 done, row `pending`, attempts 1 |
| claim only what can start | asked for 2, claimed 2, **8 left pending and claimable by anyone else** (was: all 10 leased for a minute) |
| shutdown | 0 claimed, `stoppedEarly`, 4 still pending and recoverable |
| enqueue cannot interleave with a fenced write | a competing enqueue blocks on `SELECT … FOR UPDATE` and completes only after commit |

Plus six unit tests of `refreshSearchDocumentFenced`: it takes the row lock,
and it writes **nothing** when the claim token moved, when the generation
moved, or when the job row was pruned.

## Migration

`20260922_063804_refresh_jobs_fencing` — three additive columns. Applied to a
disposable database over a row written by the *old* code: the row takes
`generation = 1`, null claim fields, and remains readable. No destructive SQL
in `up`.

## Two findings worth carrying forward

**Rolling deploy is not safe by itself.** A process on the previous release
completes with `id + status = 'running'` and no token, so while old and new
workers overlap an old worker can still finish a new worker's claim. Not
worse than today, but not fixed for the length of the overlap. The transition
must stop the drains: `REFRESH_WORKER_INTERVAL_MS=0` on the old generation,
let claims finish or leases expire, migrate, deploy, turn drains back on.
Recorded in the migration file itself.

**A fresh database cannot be built from the migration chain.** Running
`pnpm db:migrate` against an empty database fails in the earliest migration,
which assumes tables that predate the chain (`locations`). The committed
migrations are a forward series from a mid-life snapshot, not a schema from
zero. That matters for L15 restore and for any new provider environment: the
first database there has to come from a dump, not from `db:migrate`.

## What this does not show

Real instance termination deadlines, platform scheduler overlap, network
interruption between backend and frontend. Those need hosted rehearsals.
