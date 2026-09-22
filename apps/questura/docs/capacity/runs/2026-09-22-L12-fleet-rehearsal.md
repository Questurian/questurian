# L12 multi-process rehearsal — 22 September 2026

`pnpm readiness:fleet`. Real child processes, one disposable Postgres, a
faultable local receiver. Mac localhost, Node v24.15.0.

**11/11 checks passed.**

Every admission gate and every coalescing decision in this codebase is *per
process*. That is safe only if the shared state those processes coordinate
through — the outbox claim, the advisory lock, the connection identity —
behaves the way one process believes it does. A single process cannot test
that, and neither can a mock: "two workers cannot both finish this job" is a
statement about two operating-system processes and one Postgres.

## What ran

| Check | Result |
|---|---|
| two processes drain one queue to empty | **40 jobs in 207 ms** |
| every job delivered | 40/40 distinct targets |
| at-least-once without runaway duplication | 0 duplicates |
| both processes actually claimed work | yes — not one worker with a spare |
| connections identify themselves | `questura:a:rehears:payload`, `questura:b:rehears:payload` |
| a claim is held while the frontend is slow | 4 running |
| the survivor finishes what the killed process held | yes, after lease expiry |
| and it is the survivor that did it | confirmed from the survivor's own log |
| first process takes the advisory lock | `got: true` |
| second process is refused while it is held | `got: false` |
| and available again once released | `got: true` |

The kill is `SIGKILL` mid-delivery, with the receiver hanging so a claim is
genuinely held when the process dies. The survivor picks the work up when the
lease expires — the same path a crash takes, which is the point: there is one
recovery story rather than two.

`application_name` is what makes the connection line meaningful. Before it,
every connection in `pg_stat_activity` was `node`, and a budget of 41 per
process could not be checked against a database reporting a total.

## Two harness bugs worth recording

The first run reported 32/40 and "0 running". Both were the harness, not the
system:

- `waitFor(() => true, 500)` returns immediately — a condition that is
  already true is not a pause. The "claim is held" check was reading the
  table before any worker had claimed anything.
- The drain window was 20 s and measured from the wrong point. With it
  corrected, the real number is 207 ms for 40 jobs, so the original 20 s
  budget was never the constraint.

Recorded because a harness that reports a false failure is as expensive as
one that reports a false pass, and the fix is the same: measure, do not
assume.

## What this does not show

Routing fairness across replicas, a rolling release under HTTP traffic, real
termination grace, and the Redis counters being shared while local gates stay
per process. Those need serving processes behind a proxy — **L12's remaining
half, and it is owed.** The script says so when it finishes, so a reader
cannot mistake this for a fleet proof.

It is also not capacity. Two Node processes on a Mac against a local Postgres
says nothing about four Railway replicas against Neon.
