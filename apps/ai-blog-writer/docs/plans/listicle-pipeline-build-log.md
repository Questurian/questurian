# Listicle pipeline — building the verified plan

Source plan: `docs/plans/listicle-pipeline-implementation-plan.html`.
Reproduction harness: `docs/plans/listicle-pipeline-verification/recheck.py`.

Baseline on `f3449708`: 2296 backend tests pass; all ten failures and both
spend mechanisms reproduce (`recheck.py` exits 0, meaning every probe still
confirms its fault).

Batch H is not built here. It buys comparison runs, and the plan says that
needs its own budget authorisation. What is built for it is the harness work
that must exist *before* any run is bought: receipts, a dry-run manifest and a
hard cap at each provider dispatch.

## Order of work

| batch | what | probes it should stop reproducing |
|---|---|---|
| A | attempt identity, owner-token lease, pool snapshots | R2, R3, R10 |
| B | re-agreement, interview baseline, expected revision | R1 |
| C | candidate identity without guessing | R4 |
| D | cut review by candidate id, fingerprint, chunks | R5, R6, R7, S1 |
| E | subject routing and catalogue repairs | R8 |
| F | phase-specific catalogue and schema adapter | S2 |
| G | profile identity | R9 |

Each batch ends with the backend suite green and the harness re-run.

## What was built

A to G, all of them, and the harness work Batch H needs before it can be
authorised. Every probe in `recheck.py` stops reproducing and both controls
still hold:

```
R1 fixed   R2 fixed   R3 fixed   R4 fixed   R5 fixed   R6 fixed
R7 fixed   R8 fixed   R9 fixed   R10 fixed  S1 fixed   S2 fixed
controls: conflicting_rooms_already_separate True
          hotel_bars_already_classified_as_bars True
```

Backend suite 2296 -> 2382, all passing. Frontend typecheck clean, 28 frontend
tests passing.

## Batch H is not built

It buys comparison runs and the plan says that needs its own budget
authorisation. What landed is everything that has to exist first:

- `scripts/listicle_angle_comparison.py` produces a **dry-run manifest** by
  default -- the exact prompts, the resolved model, the pooling and prompt
  versions, and the worst-case provider-call count -- and writes it to
  `docs/audits/`. Read it, authorise against it, then re-run with the spend
  flag.
- The cap is enforced at each **dispatch** and counts provider calls, not
  angles. `run_one_angle` retries three times, so eight angles is up to
  twenty-four requests.
- Every request is receipted before it is sent, with the raw reply kept.
- Each case states its `place` rather than having it parsed off the seed.

## The migration, on the real database

Backed up first to `data/backups/`. Row counts before:

```
listicle_search_attempts 20   listicle_search_orders 3
listicle_cut_reviews      2   listicle_search_results 3
listicle_grills           9   listicle_angle_selections 3
```

After: 20 attempts migrated to 20 rows in `listicle_attempts`, 20 selections,
every one labelled `reconstructed`. The old table is untouched. All three real
runs open; `33fca394` reads 48 candidates from 62 rows where it previously read
43, with 12 duplicate hints -- the conservative grouping, working as designed.

The two stored cut reviews are keyed by revision and by name. They are not
applied to the current rows and they are not deleted: the screen says an
earlier check exists, was filed under different rules, and is kept as a record.

## One bug the tests did not find

Driving the real HTTP routes turned up a fault no unit test covered: after a
correction that changes every angle's ask, `progress` fell back to the previous
revision's blob and marked it `legacy`. That says two false things at once --
that those are results for this order, and that the run predates per-angle
recording. Fixed, with a regression test, and the screen now says how many
stored searches answered the previous request instead of implying they are
gone.

## Seeing the states without waiting for something to go wrong

`scripts/build_listicle_demo_run.py` builds run `zzdemo01` offline -- a failed
refresh over work that stands, two branches with one name, a hotel bar and its
lobby bar kept apart, a partial cut review with rows nobody judged. Nothing is
bought. `--remove` deletes it.
