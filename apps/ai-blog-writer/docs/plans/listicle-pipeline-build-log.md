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
