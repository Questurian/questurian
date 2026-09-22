import { randomUUID } from 'node:crypto'

import { refreshSearchDocumentFenced, type SearchIndexPool } from '@/features/articles/public/search-index/service'
import type { SearchTypeKey } from '@/features/articles/public/search-index/types'
import { deliverClientRevalidation } from '@/features/public-revalidation/revalidation/delivery'

import type { RevalidateTarget, SearchIndexTarget } from './enqueue'

/**
 * Claims committed refresh jobs and does them.
 *
 * Claiming is `FOR UPDATE SKIP LOCKED`, so any number of processes (serving
 * instances draining opportunistically, a scheduled worker, the CLI) can run
 * this at once without doing a job twice.
 *
 * **Fencing.** `id + status = 'running'` was not enough to own a job. A lease
 * expires, a second worker reclaims the row and sets it running again, and
 * then the first worker's completion matches — marking the *second* worker's
 * job done, and its side effect overwriting the newer one. Two things fix it:
 *
 *  - a **claim token**, minted per claim, that every completion, retry and
 *    side effect must present. Only the worker holding the claim can finish it.
 *  - a **generation**, bumped by every new enqueue on that key. A worker
 *    records the generation it claimed; if a newer change has landed since,
 *    its completion is discarded as *superseded* rather than counted as done,
 *    and the newer work stays pending.
 *
 * Both are needed. The token stops a stale worker finishing someone else's
 * claim; the generation stops a worker finishing work that content has moved
 * past. Superseded is reported separately from done, because a counter that
 * conflates them cannot show the problem this fixes.
 *
 * **Claim only what can start now.** A lease is a promise to start *now*.
 * The first drain leased fifty jobs and worked them one at a time; the second
 * leased four and still worked them one at a time (discovery finding 8) — so
 * the fourth job spent its lease waiting behind three slow deliveries, could
 * expire unstarted, and was reclaimed elsewhere while this process was about
 * to start it. Now each of `concurrency` slots claims **one** job, works it,
 * and only then claims the next. No job is leased before a slot is free to
 * run it, and `concurrency` is the number of jobs genuinely in flight.
 *
 * **Every job has a deadline inside its lease.** A job claimed just in time
 * has the whole lease; `JOB_DEADLINE_MS` aborts its delivery (between chunks
 * and inside a chunk's fetch) with time left to record the failure, so a slow
 * frontend turns into a retry by this worker rather than a silent reclaim by
 * another. The drain stops *claiming* at `DRAIN_DEADLINE_MS`; a job claimed
 * just before that still finishes or aborts inside its own lease.
 *
 * Delivery is at-least-once and is never promised otherwise: revalidation is
 * idempotent, so a duplicate delivery costs a wasted request, and a *missed*
 * one costs a stale page.
 *
 * A failure is retried with capped exponential backoff; after `MAX_ATTEMPTS`
 * the row is marked `failed` and kept for inspection and replay
 * (`pnpm refresh:jobs`, `/api/internal/refresh-jobs`). Completed rows are
 * pruned after `RETENTION_DAYS`; `id` is a serial and a claim token is a
 * UUID, so a pruned row cannot be confused with a new one that reuses its key.
 */

export const MAX_ATTEMPTS = 8
export const CLAIM_MS = 60_000
export const RETENTION_DAYS = 7
const MAX_BACKOFF_MS = 60 * 60 * 1000

/**
 * Jobs worked at once by one drain. One, serially, by default: background
 * work shares the serving pool and the frontend that is also serving readers,
 * and fifty launch articles do not produce a backlog that needs more. A
 * caller may ask for more; each extra slot is a real worker that claims just
 * in time, not a bigger batch.
 */
export const DEFAULT_CONCURRENCY = 1
/**
 * How long one job may run. A job claimed just in time holds the full lease,
 * so this leaves fifteen seconds of it to write the outcome. Delivery that
 * would outlive the lease is aborted and retried by this worker instead of
 * being reclaimed by another while it is still running.
 */
export const JOB_DEADLINE_MS = CLAIM_MS - 15_000
/**
 * How long one drain may keep claiming. Half the lease: a job claimed at the
 * deadline still has the other half of its lease to finish in.
 */
export const DRAIN_DEADLINE_MS = CLAIM_MS / 2
/** Jobs one drain will work before returning, however much time is left. */
export const DEFAULT_MAX_JOBS = 200

type Row = {
  id: number
  kind: 'revalidate' | 'search-index'
  target: unknown
  attempts: string | number
  reason: string | null
}

export type WorkerPool = SearchIndexPool & {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>
}

export type DrainResult = {
  claimed: number
  done: number
  retried: number
  failed: number
  /** Finished work that a newer change or another worker had moved past. */
  superseded: number
  /** True when the drain stopped on its deadline, job cap or shutdown rather than an empty queue. */
  stoppedEarly: boolean
  /**
   * Deliveries that happened but whose completion no longer matched — the
   * claim had been superseded or reclaimed. At-least-once delivery made
   * visible: each is one request the frontend received twice.
   */
  duplicateDeliveries: number
  /** Longest single job, claim to recorded outcome, in milliseconds. */
  maxJobMs: number
}

/** 30 s, 1 min, 2 min … capped at an hour, with up to 20% jitter. */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** Math.max(0, attempts - 1))
  return Math.round(base * (1 + 0.2 * random()))
}

const CLAIM_SQL = `
  UPDATE refresh_jobs
  SET status = 'running',
      attempts = attempts + 1,
      claim_token = $3,
      claimed_generation = generation,
      locked_until = now() + ($2 || ' milliseconds')::interval,
      updated_at = now()
  WHERE id IN (
    SELECT id FROM refresh_jobs
    WHERE (status = 'pending' AND next_attempt_at <= now())
       OR (status = 'running' AND locked_until < now())
    ORDER BY next_attempt_at
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, kind, target, attempts, reason
`

/**
 * The fence, in both directions. `claim_token = $2` means only the worker
 * holding this claim can finish it; `generation = claimed_generation` means
 * it can only finish the version of the work it claimed. A newer enqueue
 * bumps `generation` and resets the row to pending, so a stale completion
 * matches nothing and the newer change is processed again.
 */
const DONE_SQL = `
  UPDATE refresh_jobs
  SET status = 'done', completed_at = now(), locked_until = NULL, claim_token = NULL, last_error = NULL, updated_at = now()
  WHERE id = $1 AND status = 'running' AND claim_token = $2 AND generation = claimed_generation
`

const RETRY_SQL = `
  UPDATE refresh_jobs
  SET status = CASE WHEN attempts >= $3 THEN 'failed'::enum_refresh_jobs_status ELSE 'pending'::enum_refresh_jobs_status END,
      next_attempt_at = now() + ($2 || ' milliseconds')::interval,
      locked_until = NULL, claim_token = NULL, last_error = $4, updated_at = now()
  WHERE id = $1 AND status = 'running' AND claim_token = $5 AND generation = claimed_generation
  RETURNING status
`

const PRUNE_SQL = `
  DELETE FROM refresh_jobs WHERE id IN (
    SELECT id FROM refresh_jobs WHERE status = 'done' AND completed_at < now() - ($1 || ' days')::interval LIMIT 500
  )
`

/**
 * Shutdown. New claims stop; work already claimed finishes or has its lease
 * expire and is reclaimed elsewhere. A crashed claim is reclaimable the same
 * way, which is why nothing here has to be cleaned up on the way out.
 */
const lifecycle = globalThis as unknown as { __questuraRefreshStopping?: boolean }

export function stopClaimingRefreshJobs(): void {
  lifecycle.__questuraRefreshStopping = true
}

export function resumeClaimingRefreshJobs(): void {
  lifecycle.__questuraRefreshStopping = false
}

export function claimingStopped(): boolean {
  return lifecycle.__questuraRefreshStopping === true
}

async function process(
  pool: WorkerPool,
  row: Row,
  claimToken: string,
  signal: AbortSignal,
): Promise<'done' | 'superseded'> {
  if (row.kind === 'search-index') {
    const target = row.target as SearchIndexTarget
    const outcome = await refreshSearchDocumentFenced(pool, target.type as SearchTypeKey, target.id, {
      jobId: row.id,
      claimToken,
    })
    return outcome === 'superseded' ? 'superseded' : 'done'
  }

  const target = row.target as RevalidateTarget
  await deliverClientRevalidation({ tags: target.tags ?? [], paths: target.paths ?? [] }, row.reason ?? 'refresh-job', {
    signal,
  })
  return 'done'
}

export type DrainOptions = {
  /** Jobs worked at once, each claimed just before it starts. */
  concurrency?: number
  /** Per-job deadline; defaults to `JOB_DEADLINE_MS`. */
  jobDeadlineMs?: number
  /** Jobs this drain will work in total. */
  maxJobs?: number
  /** Wall clock after which the drain stops claiming. */
  maxMs?: number
  /** Deprecated alias for `maxJobs`, kept for existing callers. */
  limit?: number
  now?: () => number
}

export async function drainRefreshJobs(pool: WorkerPool, options: DrainOptions = {}): Promise<DrainResult> {
  const now = options.now ?? (() => Date.now())
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const maxJobs = Math.max(1, options.maxJobs ?? options.limit ?? DEFAULT_MAX_JOBS)
  const deadline = now() + Math.max(1, options.maxMs ?? DRAIN_DEADLINE_MS)
  const jobDeadlineMs = Math.max(1, Math.min(options.jobDeadlineMs ?? JOB_DEADLINE_MS, JOB_DEADLINE_MS))

  const result: DrainResult = {
    claimed: 0,
    done: 0,
    retried: 0,
    failed: 0,
    superseded: 0,
    stoppedEarly: false,
    duplicateDeliveries: 0,
    maxJobMs: 0,
  }
  // Places reserved by slots about to claim, so the cap holds across slots.
  let reserved = 0
  let empty = false

  const work = async (row: Row, claimToken: string) => {
    const started = Date.now()
    try {
      const outcome = await process(pool, row, claimToken, AbortSignal.timeout(jobDeadlineMs))
      if (outcome === 'superseded') {
        result.superseded += 1
        return
      }
      const finished = await pool.query(DONE_SQL, [row.id, claimToken])
      // Zero rows means the claim was no longer ours — a newer change
      // landed, or the lease expired and somebody else took it. Not done,
      // and the delivery that just happened was a duplicate.
      if ((finished.rowCount ?? 0) > 0) result.done += 1
      else {
        result.superseded += 1
        if (row.kind === 'revalidate') result.duplicateDeliveries += 1
      }
    } catch (error) {
      const attempts = Number(row.attempts)
      const message = error instanceof Error ? error.message : String(error)
      const retry = await pool.query(RETRY_SQL, [
        row.id,
        String(backoffMs(attempts)),
        MAX_ATTEMPTS,
        message.slice(0, 2000),
        claimToken,
      ])
      const status = (retry.rows[0] as { status?: string } | undefined)?.status
      if (status === 'failed') result.failed += 1
      else if (status) result.retried += 1
      else result.superseded += 1
    } finally {
      result.maxJobMs = Math.max(result.maxJobMs, Date.now() - started)
    }
  }

  const slot = async () => {
    for (;;) {
      if (empty) return
      if (claimingStopped() || now() >= deadline || reserved >= maxJobs) {
        result.stoppedEarly = true
        return
      }

      reserved += 1
      // One job, claimed at the moment this slot is free to start it.
      const claimToken = randomUUID()
      const claimed = await pool.query(CLAIM_SQL, [1, String(CLAIM_MS), claimToken])
      const row = (claimed.rows as Row[])[0]
      if (!row) {
        reserved -= 1
        empty = true
        return
      }

      result.claimed += 1
      await work(row, claimToken)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => slot()))

  // An empty queue is not "stopped early", whichever slot noticed first.
  if (empty) result.stoppedEarly = false

  await pool.query(PRUNE_SQL, [String(RETENTION_DAYS)])
  return result
}

export type OutboxStats = {
  pending: number
  running: number
  failed: number
  done: number
  /** Seconds the oldest due pending job has waited. The number to alert on. */
  oldestPendingAgeS: number | null
  /** Seconds the oldest live claim has been held. A stuck worker shows here. */
  oldestRunningAgeS: number | null
  /** Claims whose lease has expired: work a crashed worker left behind. */
  expiredRunning: number
}

export async function refreshJobStats(pool: WorkerPool): Promise<OutboxStats> {
  const counts = await pool.query(`SELECT status, count(*)::int AS n FROM refresh_jobs GROUP BY status`)
  const ages = await pool.query(`
    SELECT
      extract(epoch FROM now() - min(next_attempt_at) FILTER (WHERE status = 'pending' AND next_attempt_at <= now()))::int AS pending_age,
      extract(epoch FROM now() - min(updated_at) FILTER (WHERE status = 'running'))::int AS running_age,
      count(*) FILTER (WHERE status = 'running' AND locked_until < now())::int AS expired
    FROM refresh_jobs
  `)

  const by = Object.fromEntries((counts.rows as Array<{ status: string; n: number }>).map((row) => [row.status, row.n]))
  const row = ages.rows[0] as
    | { pending_age?: number | null; running_age?: number | null; expired?: number | null }
    | undefined

  return {
    pending: by.pending ?? 0,
    running: by.running ?? 0,
    failed: by.failed ?? 0,
    done: by.done ?? 0,
    oldestPendingAgeS: row?.pending_age ?? null,
    oldestRunningAgeS: row?.running_age ?? null,
    expiredRunning: row?.expired ?? 0,
  }
}

/** Put failed jobs back in the queue. Returns how many. */
export async function replayFailedRefreshJobs(pool: WorkerPool): Promise<number> {
  const result = await pool.query(
    `UPDATE refresh_jobs SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL, claim_token = NULL, updated_at = now() WHERE status = 'failed'`,
  )
  return result.rowCount ?? 0
}

export async function listFailedRefreshJobs(pool: WorkerPool, limit = 50): Promise<unknown[]> {
  const result = await pool.query(
    `SELECT id, kind, dedupe_key, reason, attempts, generation, last_error, updated_at FROM refresh_jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  )
  return result.rows
}
