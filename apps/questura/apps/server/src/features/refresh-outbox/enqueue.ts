import { createHash } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'

import { scheduleDrain } from './drain-soon'

/**
 * Record work owed to the public site, in the transaction of the change that
 * owes it. See `collection.ts` for why.
 */

export type RefreshJobKind = 'revalidate' | 'search-index'

export type RevalidateTarget = { tags: string[]; paths: string[] }
export type SearchIndexTarget = { type: string; id: string }

type DrizzleLike = { execute: (query: unknown) => Promise<unknown> }

export type TransactionalReq = {
  transactionID?: number | string | Promise<number | string | undefined>
  payload: {
    db: unknown
  }
}

/**
 * The drizzle handle for this request's transaction, or the adapter's own
 * handle when there is none. The same three lines as
 * `@payloadcms/drizzle`'s `getTransaction`, which this package does not
 * depend on directly.
 */
async function transactionFor(req: TransactionalReq): Promise<{ db: DrizzleLike; inTransaction: boolean }> {
  const adapter = req.payload.db as { drizzle: DrizzleLike; sessions?: Record<string, { db?: DrizzleLike }> }
  const id = req.transactionID === undefined ? undefined : await req.transactionID
  const session = id === undefined || id === null ? undefined : adapter.sessions?.[String(id)]?.db
  return session ? { db: session, inTransaction: true } : { db: adapter.drizzle, inTransaction: false }
}

export function outboxEnabled(): boolean {
  return process.env.REFRESH_OUTBOX !== 'off'
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort()
}

/**
 * One row per job, merged on `dedupe_key`. `INSERT … ON CONFLICT` rather than
 * find-then-create: two saves racing on the same key must never turn into a
 * unique-constraint error, because this runs inside the editor's save and an
 * error here would roll their change back.
 *
 * A conflicting row is reset to pending with its attempts cleared: a new
 * change is a new reason to try. Revalidation targets are unioned — tags and
 * paths are idempotent, so merging can only add work, never lose it.
 */
export async function enqueueRefreshJob(
  req: TransactionalReq,
  job: { kind: RefreshJobKind; dedupeKey: string; target: RevalidateTarget | SearchIndexTarget; reason: string },
): Promise<void> {
  const { db, inTransaction } = await transactionFor(req)
  const target = JSON.stringify(job.target)

  // Inside the save's transaction a failed statement would abort the whole
  // transaction and roll the editor's change back. A savepoint confines a
  // failure to this insert; the caller then falls back to inline delivery.
  if (inTransaction) await db.execute(sql`SAVEPOINT refresh_outbox`)
  try {
    await db.execute(sql`
    INSERT INTO refresh_jobs (kind, dedupe_key, target, reason, status, attempts, next_attempt_at, updated_at, created_at)
    VALUES (${job.kind}, ${job.dedupeKey}, ${target}::jsonb, ${job.reason}, 'pending', 0, now(), now(), now())
    ON CONFLICT (dedupe_key) DO UPDATE SET
      -- Parenthesised on purpose: \`->\` and \`||\` share a precedence level and
      -- associate left, so without them this concatenated whole objects and
      -- the merged target came out empty (caught by verify-refresh-outbox.ts).
      target = CASE
        WHEN refresh_jobs.kind = 'revalidate' AND refresh_jobs.status IN ('pending', 'running') THEN jsonb_build_object(
          'tags', (SELECT coalesce(jsonb_agg(DISTINCT t ORDER BY t), '[]'::jsonb) FROM jsonb_array_elements_text((refresh_jobs.target->'tags') || (EXCLUDED.target->'tags')) t),
          'paths', (SELECT coalesce(jsonb_agg(DISTINCT p ORDER BY p), '[]'::jsonb) FROM jsonb_array_elements_text((refresh_jobs.target->'paths') || (EXCLUDED.target->'paths')) p)
        )
        ELSE EXCLUDED.target
      END,
      reason = EXCLUDED.reason,
      status = 'pending',
      attempts = 0,
      next_attempt_at = now(),
      locked_until = NULL,
      last_error = NULL,
      completed_at = NULL,
      updated_at = now()
  `)
    if (inTransaction) await db.execute(sql`RELEASE SAVEPOINT refresh_outbox`)
  } catch (error) {
    if (inTransaction) await db.execute(sql`ROLLBACK TO SAVEPOINT refresh_outbox`)
    throw error
  }

  // Try to deliver shortly after the change commits. If this process dies
  // first, the row is still there for the scheduled worker.
  scheduleDrain(req.payload)
}

/** A stable key for a revalidation target: the same tags and paths merge. */
export function revalidateDedupeKey(target: RevalidateTarget): string {
  const digest = createHash('sha1')
    .update(JSON.stringify({ tags: sorted(target.tags), paths: sorted(target.paths) }))
    .digest('hex')
  return `revalidate:${digest}`
}

export function searchIndexDedupeKey(type: string, id: string | number): string {
  return `search:${type}:${id}`
}
