import { createHash } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'

import { scheduleDrain } from './drain-soon'

/**
 * Record work owed to the public site, in the transaction of the change that
 * owes it. See `collection.ts` for why.
 *
 * "In the transaction" is the whole guarantee, so it is now checked rather
 * than assumed. Previously a request whose `transactionID` could not be
 * resolved to a session silently fell through to the adapter's own handle and
 * wrote the row on a separate connection — which commits on its own schedule
 * and survives a rolled-back save. That is not an obligation attached to a
 * change; it is a second, independent write that happens to look like one.
 * A caller with no transaction at all has the same problem in the other
 * direction: the content is already committed when the hook runs, so a failed
 * insert loses the obligation with nothing left to roll back.
 *
 * Both now throw. A publication that cannot record what it owes is a
 * publication that did not happen.
 *
 * A conflicting insert also bumps `generation`, which is how a worker already
 * running the previous version of this job finds out it has been overtaken
 * (`worker.ts`).
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

export type ObligationFailure = 'no-transaction' | 'transaction-mismatch' | 'write-failed'

/**
 * Thrown into the editor's save. Payload rolls the transaction back, so the
 * content change goes with it and the editor's input is still in the form.
 * The message has to be one an editor can act on, because they are the person
 * who will see it.
 */
export class RefreshObligationError extends Error {
  constructor(
    readonly failure: ObligationFailure,
    detail: string,
  ) {
    super(
      `This change was not saved because the site could not record that it needs refreshing (${failure}). ` +
        `Nothing was published, and your edit is still here — try saving again. If it keeps happening, ` +
        `the refresh queue needs an operator. Detail: ${detail}`,
    )
    this.name = 'RefreshObligationError'
  }
}

/**
 * The drizzle handle for this request's transaction. The same lookup as
 * `@payloadcms/drizzle`'s `getTransaction`, which this package does not depend
 * on directly — but it refuses where that one falls back.
 */
async function transactionFor(req: TransactionalReq): Promise<DrizzleLike> {
  const adapter = req.payload.db as {
    drizzle?: DrizzleLike
    sessions?: Record<string, { db?: DrizzleLike }>
  }

  const id = req.transactionID === undefined ? undefined : await req.transactionID

  if (id === undefined || id === null) {
    throw new RefreshObligationError(
      'no-transaction',
      'the change was made outside a database transaction, so the obligation could not commit with it',
    )
  }

  const session = adapter.sessions?.[String(id)]?.db
  if (!session) {
    throw new RefreshObligationError(
      'transaction-mismatch',
      `transaction ${String(id)} is not open on this adapter`,
    )
  }

  return session
}

/**
 * `off` is an emergency mode, not a rollback.
 *
 * With the outbox off, a save's refresh is attempted inline and best-effort:
 * a failure is a log line and the public site keeps serving the old page
 * until something else happens to invalidate it. Production refuses to boot
 * this way without an explicit acknowledgement
 * (`shared/config/assert-production-config.ts`), because "turn the outbox
 * off" reads like a safe revert and is not one.
 */
export function outboxEnabled(): boolean {
  return process.env.REFRESH_OUTBOX !== 'off'
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort()
}

/**
 * One row per job, merged on `dedupe_key`. `INSERT … ON CONFLICT` rather than
 * find-then-create: two saves racing on the same key must never turn into a
 * unique-constraint error.
 *
 * A conflicting row is reset to pending with its attempts cleared: a new
 * change is a new reason to try. Revalidation targets are unioned — tags and
 * paths are idempotent, so merging can only add work, never lose it.
 *
 * The savepoint is still here, but its purpose has changed. It used to
 * confine a failure so the save could continue without the obligation. Now it
 * exists so the failure arrives as a usable error rather than as Postgres's
 * "current transaction is aborted" on whatever statement Payload runs next.
 */
export async function enqueueRefreshJob(
  req: TransactionalReq,
  job: { kind: RefreshJobKind; dedupeKey: string; target: RevalidateTarget | SearchIndexTarget; reason: string },
): Promise<void> {
  const db = await transactionFor(req)
  const target = JSON.stringify(job.target)

  await db.execute(sql`SAVEPOINT refresh_outbox`)
  try {
    await db.execute(sql`
    INSERT INTO refresh_jobs (kind, dedupe_key, target, reason, status, attempts, generation, next_attempt_at, updated_at, created_at)
    VALUES (${job.kind}, ${job.dedupeKey}, ${target}::jsonb, ${job.reason}, 'pending', 0, 1, now(), now(), now())
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
      -- A newer change is a newer generation. A worker still holding the
      -- previous one can no longer complete this row: its completion checks
      -- generation against claimed_generation and finds it moved (worker.ts).
      generation = refresh_jobs.generation + 1,
      next_attempt_at = now(),
      locked_until = NULL,
      claim_token = NULL,
      last_error = NULL,
      completed_at = NULL,
      updated_at = now()
  `)
    await db.execute(sql`RELEASE SAVEPOINT refresh_outbox`)
  } catch (error) {
    await db.execute(sql`ROLLBACK TO SAVEPOINT refresh_outbox`).catch(() => {
      // The transaction may already be unusable; the throw below is what
      // matters and Payload rolls the whole thing back either way.
    })
    throw new RefreshObligationError('write-failed', error instanceof Error ? error.message : String(error))
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
