import { createHash } from 'node:crypto'
import type { getPayload } from 'payload'
import { logger } from './logger'

/**
 * Postgres advisory locks, for serialising work that spans a read, a network
 * call and a write.
 *
 * Payload has no way to express "hold a row against a concurrent handler while
 * I go and ask Stripe something", and the operation is not a single statement,
 * so ordinary row locks do not help. Stripe delivers webhooks in parallel, so
 * two events for the same subscription can otherwise interleave: both read the
 * same before-state, both write, and both conclude the same transition
 * happened and send the same email twice.
 *
 * This is the only raw SQL in runtime server code. It is deliberate and narrow:
 * one lock, keyed per subscription, so unrelated visitors never contend.
 */

/** Postgres advisory locks take a bigint; hash the key into a stable signed 64-bit value. */
function lockKey(key: string): bigint {
  const digest = createHash('sha256').update(key).digest()

  return digest.readBigInt64BE(0)
}

type Payload = Awaited<ReturnType<typeof getPayload>>

/**
 * Run `work` while holding an exclusive advisory lock on `key`.
 *
 * Uses a session-level lock on a dedicated pooled connection rather than a
 * transaction-scoped one, because the work runs through Payload on its own
 * connections. The lock is always released, including when `work` throws.
 */
export async function withAdvisoryLock<T>(
  payload: Payload,
  key: string,
  work: () => Promise<T>
): Promise<T> {
  const pool = (payload.db as { pool?: { connect: () => Promise<PoolClient> } }).pool

  if (!pool) {
    // A non-postgres adapter (or a test double) cannot serialise here. Losing
    // the lock is not worth losing the operation, so proceed unserialised.
    logger.warn('No Postgres pool available; running without an advisory lock', { key })
    return work()
  }

  const id = lockKey(key)
  const client = await pool.connect()

  try {
    await client.query('SELECT pg_advisory_lock($1)', [id.toString()])

    try {
      return await work()
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [id.toString()])
    }
  } finally {
    client.release()
  }
}

type PoolClient = {
  query: (text: string, values?: unknown[]) => Promise<unknown>
  release: () => void
}
