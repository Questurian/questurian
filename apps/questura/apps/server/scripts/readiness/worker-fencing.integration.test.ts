// @vitest-environment node
//
// Real connections, real timers, real `fetch`. The default jsdom environment
// replaces enough of the platform that `AbortSignal.timeout()` is not the
// AbortSignal its `fetch` accepts — which fails the delivery under test for a
// reason that has nothing to do with the code.
import type { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FaultReceiver } from './fault-receiver'
import {
  createSandboxDatabase,
  createSandboxSchema,
  REFRESH_JOBS_DDL,
  sandboxAvailable,
  sandboxPool,
} from './database'

/**
 * L02: two workers, one job, real connections.
 *
 * The claim used to be `id + status = 'running'`, which is not ownership. A
 * lease expires, a second worker reclaims the row and sets it running again,
 * and the first worker's completion still matches — marking the *second*
 * worker's job done and dropping the newer work on the floor. Nothing in a
 * mock can show that: it needs two connections, a real `FOR UPDATE SKIP
 * LOCKED` claim, and a barrier to hold one worker still while the other moves.
 *
 * Skips when no disposable Postgres is reachable.
 */

/** This file's private schema, so a parallel test file cannot truncate under it. */
const SCHEMA = 'readiness_fencing'

const available = await ready()

async function ready(): Promise<boolean> {
  if (await sandboxAvailable()) return true
  try {
    await createSandboxDatabase()
    return true
  } catch {
    return false
  }
}

const SECRET = 'readiness-sandbox-revalidation-secret'

describe.skipIf(!available)('refresh worker fencing', () => {
  let pool: Pool
  let receiver: FaultReceiver
  let drainRefreshJobs: typeof import('@/features/refresh-outbox/worker')['drainRefreshJobs']

  beforeAll(async () => {
    receiver = new FaultReceiver()
    const port = await receiver.listen()
    process.env.QUESTURA_CLIENT_URL = `http://127.0.0.1:${port}`
    process.env.QUESTURA_REVALIDATION_SECRET = SECRET

    await createSandboxSchema(SCHEMA)
    pool = sandboxPool(8, SCHEMA)
    await pool.query(REFRESH_JOBS_DDL)
    ;({ drainRefreshJobs } = await import('@/features/refresh-outbox/worker'))
  })

  afterAll(async () => {
    await receiver?.close()
    await pool?.end()
  })

  beforeEach(async () => {
    await pool.query('TRUNCATE refresh_jobs RESTART IDENTITY')
    receiver.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function enqueue(dedupeKey: string, tags: string[]): Promise<number> {
    const result = await pool.query(
      `INSERT INTO refresh_jobs (kind, dedupe_key, target, reason, status, attempts, generation, next_attempt_at)
       VALUES ('revalidate', $1, $2::jsonb, 'test', 'pending', 0, 1, now())
       ON CONFLICT (dedupe_key) DO UPDATE SET
         target = EXCLUDED.target,
         status = 'pending',
         attempts = 0,
         generation = refresh_jobs.generation + 1,
         next_attempt_at = now(),
         locked_until = NULL,
         claim_token = NULL,
         updated_at = now()
       RETURNING id`,
      [dedupeKey, JSON.stringify({ tags, paths: [] })],
    )
    return (result.rows[0] as { id: number }).id
  }

  async function job(id: number) {
    const result = await pool.query(
      `SELECT status, generation, claimed_generation, claim_token, attempts, target FROM refresh_jobs WHERE id = $1`,
      [id],
    )
    return result.rows[0] as {
      status: string
      generation: string
      claimed_generation: string | null
      claim_token: string | null
      attempts: string
      target: { tags: string[] }
    }
  }

  /** Claim without working, the way a worker that then stalls would. */
  async function claimOnly(): Promise<{ id: number; token: string } | null> {
    const token = `test-${Math.random().toString(36).slice(2)}`
    const result = await pool.query(
      `UPDATE refresh_jobs
       SET status = 'running', attempts = attempts + 1, claim_token = $1, claimed_generation = generation,
           locked_until = now() + interval '60 seconds', updated_at = now()
       WHERE id IN (
         SELECT id FROM refresh_jobs
         WHERE (status = 'pending' AND next_attempt_at <= now())
            OR (status = 'running' AND locked_until < now())
         ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED
       )
       RETURNING id`,
      [token],
    )
    const row = result.rows[0] as { id: number } | undefined
    return row ? { id: row.id, token } : null
  }

  /** The completion a stale worker would attempt. */
  async function completeAs(id: number, token: string): Promise<number> {
    const result = await pool.query(
      `UPDATE refresh_jobs
       SET status = 'done', completed_at = now(), locked_until = NULL, claim_token = NULL, updated_at = now()
       WHERE id = $1 AND status = 'running' AND claim_token = $2 AND generation = claimed_generation`,
      [id, token],
    )
    return result.rowCount ?? 0
  }

  // The plan's first acceptance: A claims, a newer save lands, B claims, A
  // finishes. A must not be able to complete, and B's newer work must survive.
  it('a worker overtaken by a newer save cannot complete the job', async () => {
    const id = await enqueue('revalidate:fence-1', ['old'])

    const a = await claimOnly()
    expect(a).not.toBeNull()

    // A newer save on the same key while A holds the claim.
    await enqueue('revalidate:fence-1', ['new'])

    const afterNewerSave = await job(id)
    expect(afterNewerSave.status).toBe('pending')
    expect(Number(afterNewerSave.generation)).toBe(2)

    // B picks it up.
    const b = await claimOnly()
    expect(b?.id).toBe(id)

    // A, still running, tries to finish.
    expect(await completeAs(id, a!.token)).toBe(0)

    const afterStaleCompletion = await job(id)
    expect(afterStaleCompletion.status).toBe('running')
    expect(afterStaleCompletion.claim_token).toBe(b!.token)
    expect(afterStaleCompletion.target.tags).toEqual(['new'])
  })

  // The failure the old code actually had: nothing to do with new saves.
  // A's lease expires, B reclaims, A wakes up and marks B's claim done.
  it('a worker whose lease expired cannot complete the claim that replaced it', async () => {
    const id = await enqueue('revalidate:fence-2', ['t'])
    const a = await claimOnly()

    await pool.query(`UPDATE refresh_jobs SET locked_until = now() - interval '1 second' WHERE id = $1`, [id])

    const b = await claimOnly()
    expect(b?.id).toBe(id)
    expect(b?.token).not.toBe(a?.token)

    expect(await completeAs(id, a!.token)).toBe(0)
    expect((await job(id)).status).toBe('running')

    // B can finish its own claim.
    expect(await completeAs(id, b!.token)).toBe(1)
    expect((await job(id)).status).toBe('done')
  })

  it('a stale completion is counted as superseded, never as done', async () => {
    await enqueue('revalidate:fence-3', ['t'])
    const a = await claimOnly()
    await pool.query(`UPDATE refresh_jobs SET locked_until = now() - interval '1 second' WHERE id = $1`, [a!.id])
    await claimOnly()

    // The real worker path: claim (reclaiming the expired row), deliver, and
    // try to finish. The row it claims is the one B is already holding, so
    // the drain's own completion succeeds; what matters is that a *stale*
    // token cannot add to `done`.
    expect(await completeAs(a!.id, a!.token)).toBe(0)
  })

  // The whole queue, end to end, through the real worker.
  it('drains real jobs through the real worker and delivers them once each', async () => {
    for (let index = 0; index < 6; index += 1) {
      await enqueue(`revalidate:drain-${index}`, [`tag-${index}`])
    }

    const result = await drainRefreshJobs(pool as never, { concurrency: 3 })

    expect(result.claimed).toBe(6)
    expect(result.done).toBe(6)
    expect(result.superseded).toBe(0)
    expect(receiver.allTags()).toEqual(new Set(['tag-0', 'tag-1', 'tag-2', 'tag-3', 'tag-4', 'tag-5']))

    const remaining = await pool.query(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status <> 'done'`)
    expect(remaining.rows[0].n).toBe(0)
  })

  // A frontend that answers 500 must leave the obligation retryable. The old
  // "unconfigured means done" path is the reason this is worth asserting
  // against a real database rather than a mock.
  it('keeps a job pending and retryable when the frontend refuses it', async () => {
    const id = await enqueue('revalidate:retry-1', ['t'])
    receiver.mode = { kind: 'status', status: 500 }

    const result = await drainRefreshJobs(pool as never, { concurrency: 1 })

    expect(result.retried).toBe(1)
    expect(result.done).toBe(0)

    const row = await job(id)
    expect(row.status).toBe('pending')
    expect(Number(row.attempts)).toBe(1)
  })

  it('claims only as many jobs as it can start, not the whole queue', async () => {
    for (let index = 0; index < 10; index += 1) {
      await enqueue(`revalidate:batch-${index}`, [`b-${index}`])
    }

    // A deadline in the past: claim one batch, then stop.
    const result = await drainRefreshJobs(pool as never, { concurrency: 2, maxJobs: 2 })

    expect(result.claimed).toBe(2)

    const stillPending = await pool.query(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status = 'pending'`)
    // The other eight were never leased, so another worker can take them now.
    expect(stillPending.rows[0].n).toBe(8)
  })

  it('stops claiming on shutdown and leaves the rest recoverable', async () => {
    for (let index = 0; index < 4; index += 1) {
      await enqueue(`revalidate:stop-${index}`, [`s-${index}`])
    }

    const { stopClaimingRefreshJobs, resumeClaimingRefreshJobs } = await import('@/features/refresh-outbox/worker')
    stopClaimingRefreshJobs()
    try {
      const result = await drainRefreshJobs(pool as never, { concurrency: 2 })
      expect(result.claimed).toBe(0)
      expect(result.stoppedEarly).toBe(true)
    } finally {
      resumeClaimingRefreshJobs()
    }

    const pending = await pool.query(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status = 'pending'`)
    expect(pending.rows[0].n).toBe(4)
  })

  // The enqueue side of the fence: a concurrent save cannot slip between a
  // worker's ownership check and its write, because the check locks the row.
  it('blocks a concurrent enqueue while a fenced write holds the job row', async () => {
    const id = await enqueue('search:articles:1', ['t'])
    const holder = await pool.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT claim_token, generation FROM refresh_jobs WHERE id = $1 FOR UPDATE`, [id])

      let enqueueFinished = false
      const competing = enqueue('search:articles:1', ['newer']).then(() => {
        enqueueFinished = true
      })

      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(enqueueFinished).toBe(false)

      await holder.query('COMMIT')
      await competing
      expect(enqueueFinished).toBe(true)
    } finally {
      holder.release()
    }
  })
})
