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
 * **Claim only what can start now.** The old drain leased fifty jobs for
 * sixty seconds and processed them one at a time. Jobs forty to fifty sat
 * leased — invisible to every other worker — for most of a lease they had not
 * started, and any that had not finished when the lease expired were
 * reclaimed elsewhere while this process was still working on them. Now a
 * drain claims a batch the size of its concurrency, works it, and claims
 * again if there is time left inside a deadline comfortably shorter than the
 * lease.
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

/** Jobs worked at once by one drain. Also the size of a single claim. */
export const DEFAULT_CONCURRENCY = 4
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
  /** True when the drain stopped on its deadline or job cap with work left. */
  stoppedEarly: boolean
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

async function process(pool: WorkerPool, row: Row, claimToken: string): Promise<'done' | 'superseded'> {
  if (row.kind === 'search-index') {
    const target = row.target as SearchIndexTarget
    const outcome = await refreshSearchDocumentFenced(pool, target.type as SearchTypeKey, target.id, {
      jobId: row.id,
      claimToken,
    })
    return outcome === 'superseded' ? 'superseded' : 'done'
  }

  const target = row.target as RevalidateTarget
  await deliverClientRevalidation({ tags: target.tags ?? [], paths: target.paths ?? [] }, row.reason ?? 'refresh-job')
  return 'done'
}

export type DrainOptions = {
  /** Jobs claimed and worked at once. */
  concurrency?: number
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

  const result: DrainResult = { claimed: 0, done: 0, retried: 0, failed: 0, superseded: 0, stoppedEarly: false }

  while (result.claimed < maxJobs) {
    if (claimingStopped()) {
      result.stoppedEarly = true
      break
    }
    if (now() >= deadline) {
      result.stoppedEarly = true
      break
    }

    const batch = Math.min(concurrency, maxJobs - result.claimed)
    const claimToken = randomUUID()
    const claimed = await pool.query(CLAIM_SQL, [batch, String(CLAIM_MS), claimToken])
    const rows = claimed.rows as Row[]
    if (rows.length === 0) break

    result.claimed += rows.length

    for (const row of rows) {
      try {
        const outcome = await process(pool, row, claimToken)
        if (outcome === 'superseded') {
          result.superseded += 1
          continue
        }
        const finished = await pool.query(DONE_SQL, [row.id, claimToken])
        // Zero rows means the claim was no longer ours — a newer change
        // landed, or the lease expired and somebody else took it. Not done.
        if ((finished.rowCount ?? 0) > 0) result.done += 1
        else result.superseded += 1
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
      }
    }

    // A short batch means the queue is empty; claiming again would be a
    // wasted round trip.
    if (rows.length < batch) break
  }

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
