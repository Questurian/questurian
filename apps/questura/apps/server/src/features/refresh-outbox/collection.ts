import type { CollectionConfig } from 'payload'

/**
 * Work owed to the public site after a content change: tell the frontend to
 * revalidate, or bring a search row in line with its document.
 *
 * Both used to run inline in `afterChange`, which Payload runs *inside* the
 * save's transaction. The search refresh used its own connection, so it read
 * the committed — i.e. previous — state of the row: a first publish could be
 * indexed as "nothing to index". The frontend could likewise be told to
 * refetch before the new state was visible. And a failure was a log line:
 * nobody retried it.
 *
 * Now the hook writes a row here in the same transaction as the change, so
 * the obligation exists exactly when the change does (commit) and not before.
 * A worker (`worker.ts`) claims committed rows with `FOR UPDATE SKIP LOCKED`,
 * does the work reading current state, and retries with capped backoff. One
 * row per `dedupeKey`: a second change to the same document before the first
 * is processed resets the row rather than queuing a duplicate, and because
 * processing reads current state the newest change always wins — a delete
 * processed after an older update removes the search row.
 *
 * Hidden and closed to every API; operated through `/api/internal/refresh-jobs`
 * and `pnpm refresh:jobs`.
 */
export const RefreshJobs: CollectionConfig = {
  slug: 'refresh-jobs',
  admin: {
    hidden: true,
  },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: ['revalidate', 'search-index'],
    },
    {
      name: 'dedupeKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      // revalidate: { tags, paths }. search-index: { type, id }.
      name: 'target',
      type: 'json',
      required: true,
    },
    {
      name: 'reason',
      type: 'text',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: ['pending', 'running', 'done', 'failed'],
    },
    {
      name: 'attempts',
      type: 'number',
      required: true,
      defaultValue: 0,
    },
    {
      // Bumped every time a newer change lands on this key. A worker records
      // the generation it claimed; a completion whose generation is no longer
      // current is discarded rather than allowed to mark newer work done.
      name: 'generation',
      type: 'number',
      required: true,
      defaultValue: 1,
    },
    {
      // The fence. `id + status = 'running'` was not enough: once a lease
      // expired and a second worker reclaimed the row, the first worker's
      // completion still matched and marked the second worker's job done.
      // A per-claim token means only the worker that holds the claim can
      // finish it.
      name: 'claimToken',
      type: 'text',
    },
    {
      name: 'claimedGeneration',
      type: 'number',
    },
    {
      name: 'nextAttemptAt',
      type: 'date',
      required: true,
      index: true,
    },
    {
      // A claimed row whose worker died becomes claimable again after this.
      name: 'lockedUntil',
      type: 'date',
    },
    {
      name: 'lastError',
      type: 'textarea',
    },
    {
      name: 'completedAt',
      type: 'date',
    },
  ],
}
