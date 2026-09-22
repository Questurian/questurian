# Surge L06 — refresh jobs are claimed just in time

Local, 2026-09-22. Base `5ab59f47` plus this change. Real Postgres
(`questura_readiness`, schema `readiness_fencing`), real `fetch` to a loopback
fault receiver. Discovery finding 8.

## The defect

The drain claimed four jobs and worked them one at a time. A job's 60-second
lease started at the claim, so the fourth job spent its lease waiting behind
three slow deliveries, could expire unstarted, and be reclaimed by another
worker while this one was about to start it. Fencing prevented a stale
completion, not the duplicate delivery. The worker's own comment said it
claimed "a batch the size of its concurrency" and worked it — it worked it
serially.

## The change

- Each of `concurrency` slots claims **one** job, works it, then claims the
  next. `concurrency` now means jobs genuinely in flight. Default **1**
  (serial): background work shares the serving pool and the frontend, and a
  fifty-article launch does not produce a backlog that needs more. The
  internal endpoint and CLI no longer ask for 4.
- Each job has a deadline, `JOB_DEADLINE_MS` = lease − 15 s, passed as an
  `AbortSignal` through delivery: checked between chunks and combined with
  each chunk's own timeout. A slow frontend becomes a retry by this worker,
  not a reclaim by another.
- The claim token is per job (was per batch).
- `DrainResult` gains `duplicateDeliveries` (delivered, then the completion no
  longer matched — at-least-once made visible) and `maxJobMs`.

Delivery remains **at least once**. Fencing (claim token + generation) is
unchanged; no completion can finish another generation's job.

## Results (15/15, `scripts/readiness/worker-fencing.integration.test.ts`)

| Check | Result |
|---|---|
| 4 jobs × 150 ms delivery, serial: running ≤ 1 at every sample, others pending and unleased | pass |
| Second worker on its own pool takes jobs the first has not started; 4 done, 0 duplicates | pass |
| `concurrency: 2` runs two at once (4 × 200 ms in < 700 ms) | pass |
| Delivery hanging 2 s with a 200 ms job deadline: aborted < 1.5 s, job pending, claim released | pass |
| 150 tags (2 chunks), chunk 2 answers 503: not done; retry replays both; all 150 delivered; done | pass |
| Newer save lands mid-delivery: stale completion refused, `duplicateDeliveries: 1`, gen-2 delivered next | pass |
| Shutdown mid-drain: in-flight job finishes, nothing new claimed, 2 remain pending | pass |
| Existing fencing (overtaken, expired lease, stale completion, retry, cap, shutdown, enqueue lock) | pass (8) |

## Shutdown and termination

`shutdownRefreshWorker` stops claiming and waits up to 10 s. A job still in
flight after that keeps running until the process exits; its lease (60 s)
then expires and any worker reclaims it. SIGKILL is the same path without the
grace. The obligation is never lost; the cost is at most one duplicate
delivery. Real termination grace on the hosted platform is still owed.

## Inspecting and replaying failures locally

`pnpm refresh:jobs` (stats, failed list, replay) and
`GET/POST /api/internal/refresh-jobs`. Stats include oldest pending age and
expired leases.

## Limits

Tiny deterministic fan-outs on a loopback receiver. No hosted scheduler, no
real frontend. Integration tests skip in CI until the required-integration job
(surge L09) provides Postgres.
