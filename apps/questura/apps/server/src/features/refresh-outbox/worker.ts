import { refreshSearchDocument, type SearchIndexPool } from '@/features/articles/public/search-index/service'
import type { SearchTypeKey } from '@/features/articles/public/search-index/types'
import { deliverClientRevalidation } from '@/features/public-revalidation/revalidation/delivery'

import type { RevalidateTarget, SearchIndexTarget } from './enqueue'

/**
 * Claims committed refresh jobs and does them.
 *
 * Claiming is `FOR UPDATE SKIP LOCKED`, so any number of processes (serving
 * instances draining opportunistically, a scheduled worker, the CLI) can run
 * this at once without doing a job twice. A claim holds the row for
 * `CLAIM_MS`; a worker that dies mid-job leaves it claimable again after that.
 *
 * Every job reads current state when it runs, so order does not matter and
 * the newest change wins: a search job re-derives the row from the document
 * as it is now (absent or unpublished → the row is removed), and revalidation
 * is idempotent.
 *
 * A failure is retried with capped exponential backoff; after
 * `MAX_ATTEMPTS` the row is marked `failed` and kept for inspection and
 * replay (`pnpm refresh:jobs`, `/api/internal/refresh-jobs`). Completed rows
 * are pruned after `RETENTION_DAYS`.
 */

export const MAX_ATTEMPTS = 8
export const CLAIM_MS = 60_000
export const RETENTION_DAYS = 7
const MAX_BACKOFF_MS = 60 * 60 * 1000

type Row = { id: number; kind: 'revalidate' | 'search-index'; target: unknown; attempts: string | number; reason: string | null }

export type WorkerPool = SearchIndexPool & {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>
}

export type DrainResult = { claimed: number; done: number; retried: number; failed: number }

/** 30 s, 1 min, 2 min … capped at an hour, with up to 20% jitter. */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** Math.max(0, attempts - 1))
  return Math.round(base * (1 + 0.2 * random()))
}

const CLAIM_SQL = `
  UPDATE refresh_jobs
  SET status = 'running', attempts = attempts + 1, locked_until = now() + ($2 || ' milliseconds')::interval, updated_at = now()
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

// `status = 'running'` guards a newer enqueue: if the row was reset to pending
// while this worker ran, the completion does not overwrite it and the newer
// change is processed again.
const DONE_SQL = `
  UPDATE refresh_jobs SET status = 'done', completed_at = now(), locked_until = NULL, last_error = NULL, updated_at = now()
  WHERE id = $1 AND status = 'running'
`

const RETRY_SQL = `
  UPDATE refresh_jobs
  SET status = CASE WHEN attempts >= $3 THEN 'failed'::enum_refresh_jobs_status ELSE 'pending'::enum_refresh_jobs_status END,
      next_attempt_at = now() + ($2 || ' milliseconds')::interval,
      locked_until = NULL, last_error = $4, updated_at = now()
  WHERE id = $1 AND status = 'running'
  RETURNING status
`

const PRUNE_SQL = `
  DELETE FROM refresh_jobs WHERE id IN (
    SELECT id FROM refresh_jobs WHERE status = 'done' AND completed_at < now() - ($1 || ' days')::interval LIMIT 500
  )
`

async function process(pool: WorkerPool, row: Row): Promise<void> {
  if (row.kind === 'search-index') {
    const target = row.target as SearchIndexTarget
    await refreshSearchDocument(pool, target.type as SearchTypeKey, target.id)
    return
  }
  const target = row.target as RevalidateTarget
  await deliverClientRevalidation({ tags: target.tags ?? [], paths: target.paths ?? [] }, row.reason ?? 'refresh-job')
}

export async function drainRefreshJobs(pool: WorkerPool, options: { limit?: number } = {}): Promise<DrainResult> {
  const result: DrainResult = { claimed: 0, done: 0, retried: 0, failed: 0 }
  const claimed = await pool.query(CLAIM_SQL, [options.limit ?? 50, String(CLAIM_MS)])
  const rows = claimed.rows as Row[]
  result.claimed = rows.length

  for (const row of rows) {
    try {
      await process(pool, row)
      await pool.query(DONE_SQL, [row.id])
      result.done += 1
    } catch (error) {
      const attempts = Number(row.attempts)
      const message = error instanceof Error ? error.message : String(error)
      const retry = await pool.query(RETRY_SQL, [row.id, String(backoffMs(attempts)), MAX_ATTEMPTS, message.slice(0, 2000)])
      const status = (retry.rows[0] as { status?: string } | undefined)?.status
      if (status === 'failed') result.failed += 1
      else result.retried += 1
    }
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
}

export async function refreshJobStats(pool: WorkerPool): Promise<OutboxStats> {
  const counts = await pool.query(`SELECT status, count(*)::int AS n FROM refresh_jobs GROUP BY status`)
  const oldest = await pool.query(
    `SELECT extract(epoch FROM now() - min(next_attempt_at))::int AS age FROM refresh_jobs WHERE status = 'pending' AND next_attempt_at <= now()`,
  )
  const by = Object.fromEntries((counts.rows as Array<{ status: string; n: number }>).map((row) => [row.status, row.n]))
  const age = (oldest.rows[0] as { age?: number | null } | undefined)?.age
  return {
    pending: by.pending ?? 0,
    running: by.running ?? 0,
    failed: by.failed ?? 0,
    done: by.done ?? 0,
    oldestPendingAgeS: age ?? null,
  }
}

/** Put failed jobs back in the queue. Returns how many. */
export async function replayFailedRefreshJobs(pool: WorkerPool): Promise<number> {
  const result = await pool.query(
    `UPDATE refresh_jobs SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL, updated_at = now() WHERE status = 'failed'`,
  )
  return result.rowCount ?? 0
}

export async function listFailedRefreshJobs(pool: WorkerPool, limit = 50): Promise<unknown[]> {
  const result = await pool.query(
    `SELECT id, kind, dedupe_key, reason, attempts, last_error, updated_at FROM refresh_jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  )
  return result.rows
}
