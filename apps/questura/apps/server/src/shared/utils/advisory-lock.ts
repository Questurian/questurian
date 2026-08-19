import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import type { getPayload } from 'payload'
import { APP_CONFIG } from '@/shared/config'
import { logger } from './logger'

/**
 * Postgres advisory locks, for serialising work that spans a read, a network
 * call and a write.
 *
 * Payload has no way to express "hold a row against a concurrent handler while
 * I go and ask Stripe something", and the operation is not a single statement,
 * so ordinary row locks do not help. Stripe delivers webhooks in parallel, so
 * two events for the same customer can otherwise interleave: both read the
 * same before-state, both write, and both conclude the same transition
 * happened and send the same email twice.
 *
 * This is the only raw SQL in runtime server code. It is deliberate and narrow:
 * one lock, keyed per Stripe customer (`customerLockKey`) or per event, so
 * unrelated visitors never contend.
 *
 * Connection ownership, and why it is not Payload's pool
 * ------------------------------------------------------
 * A session-level lock holds its connection for the whole of `work` — every
 * Stripe call and email send inside it. Taken from Payload's pool that is a
 * mutual wait, not contention: the Stripe webhook handler locks per event, then
 * `resyncSubscription` locks per customer inside it, and the queries those
 * locks exist to protect need connections from the same pool. Enough concurrent
 * deliveries (measured 2026-08-15: roughly 7-9 against `pool.max: 20`) and every
 * connection is held by a lock holder that cannot progress without a connection
 * no one can release. `connectionTimeoutMillis` turns that into 500s, Stripe
 * retries, and the retries add concurrency — the loop amplifies itself.
 *
 * Two properties here make that impossible rather than unlikely:
 *
 *   1. Locks use their own small pool. Holding a lock can no longer starve the
 *      queries the lock is protecting; those still come from Payload's pool,
 *      which nothing holds across a network call.
 *   2. Nested locks share one connection, via `AsyncLocalStorage`. Postgres
 *      advisory locks are session-scoped and counted, so one session can hold
 *      several keys and release them independently. Without this, the same
 *      deadlock reappears inside the smaller pool: N callers each holding an
 *      event lock and each waiting for a subscription lock connection.
 *
 * Together they bound a request to one lock connection, so a waiter holds
 * nothing while it waits. Exhaustion degrades to queueing that drains as
 * holders finish, which is contention — the thing pools are for.
 */

/** Postgres advisory locks take a bigint; hash the key into a stable signed 64-bit value. */
function lockKey(key: string): bigint {
  const digest = createHash('sha256').update(key).digest()

  return digest.readBigInt64BE(0)
}

type Payload = Awaited<ReturnType<typeof getPayload>>

/**
 * Sized for lock holders, not for queries: one connection per in-flight locked
 * operation, and locked operations are webhook deliveries and resyncs. Kept well
 * clear of Postgres' 100, alongside Payload's 20 and BetterAuth's 10.
 */
const LOCK_POOL_MAX = 10

/**
 * Survives Next's dev hot-reload, which re-evaluates this module and would
 * otherwise leak a pool per reload.
 */
const globalForLocks = globalThis as unknown as { advisoryLockPool?: Pool }

function getLockPool(): Pool | null {
  if (!APP_CONFIG.database.uri) {
    return null
  }

  if (!globalForLocks.advisoryLockPool) {
    const pool = new Pool({
      connectionString: APP_CONFIG.database.uri,
      max: LOCK_POOL_MAX,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Fail fast instead of hanging forever
    })

    // An idle client erroring (server restart, network drop) emits on the pool;
    // unhandled, that is a process-level crash.
    pool.on('error', (error) => {
      logger.error('Advisory lock pool client error', { error: error.message })
    })

    globalForLocks.advisoryLockPool = pool
  }

  return globalForLocks.advisoryLockPool
}

/**
 * The connection currently holding this async context's locks, if any, so
 * nested `withAdvisoryLock` calls reuse it instead of taking a second one.
 */
type LockSession = { client: PoolClient; broken?: Error }

const lockSession = new AsyncLocalStorage<LockSession>()

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/** Take `id` on an already-owned connection, run `work`, release `id`. */
async function lockOn<T>(
  session: LockSession,
  id: string,
  work: () => Promise<T>
): Promise<T> {
  try {
    await session.client.query('SELECT pg_advisory_lock($1)', [id])
  } catch (error) {
    session.broken = toError(error)
    throw error
  }

  try {
    return await work()
  } finally {
    try {
      await session.client.query('SELECT pg_advisory_unlock($1)', [id])
    } catch (error) {
      // Marking the connection broken is what actually releases the lock:
      // discarding it ends the session, and Postgres drops session locks with
      // it. Swallowed rather than thrown so a failure here cannot mask the
      // result — or the real error — from `work`.
      session.broken = toError(error)
      logger.error('Failed to release advisory lock; discarding connection', {
        error: session.broken.message,
      })
    }
  }
}

/**
 * Run `work` while holding an exclusive advisory lock on `key`.
 *
 * Uses a session-level lock on a connection from the dedicated lock pool rather
 * than a transaction-scoped one, because the work runs through Payload on its
 * own connections. Nested calls reuse the caller's connection. The lock is
 * always released, including when `work` throws.
 */
export async function withAdvisoryLock<T>(
  payload: Payload,
  key: string,
  work: () => Promise<T>
): Promise<T> {
  const hasPostgres = Boolean((payload.db as { pool?: unknown }).pool)
  const pool = hasPostgres ? getLockPool() : null

  if (!pool) {
    // A non-postgres adapter (or a test double) cannot serialise here. Losing
    // the lock is not worth losing the operation, so proceed unserialised.
    logger.warn('No Postgres pool available; running without an advisory lock', { key })
    return work()
  }

  const id = lockKey(key).toString()
  const existing = lockSession.getStore()

  // Already holding a lock in this async context: same session, second key.
  if (existing) {
    return lockOn(existing, id, work)
  }

  const client = await pool.connect()
  const session: LockSession = { client }

  try {
    return await lockSession.run(session, () => lockOn(session, id, work))
  } finally {
    // Passing an error destroys the connection instead of returning it to the
    // pool, which is the point when locks may still be held on it.
    client.release(session.broken)
  }
}

/** Close the lock pool. For process shutdown and test teardown. */
export async function closeAdvisoryLockPool(): Promise<void> {
  const pool = globalForLocks.advisoryLockPool

  if (!pool) {
    return
  }

  globalForLocks.advisoryLockPool = undefined
  await pool.end()
}
