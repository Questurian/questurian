import { unique } from '@/features/public-revalidation/revalidation/cache-tags'
import { triggerClientRevalidation } from '@/features/public-revalidation/revalidation/delivery'
import type { RevalidationTarget } from '@/features/public-revalidation/revalidation/types'
import {
  refreshSearchDocumentSafely,
  removeSearchDocumentSafely,
  type SearchIndexPool,
} from '@/features/articles/public/search-index/service'
import type { SearchTypeKey } from '@/features/articles/public/search-index/types'
import { logger } from '@/shared/utils/logger'

import {
  enqueueRefreshJob,
  outboxEnabled,
  RefreshObligationError,
  revalidateDedupeKey,
  searchIndexDedupeKey,
  type TransactionalReq,
} from './enqueue'

/**
 * What content hooks call instead of doing refresh work inline.
 *
 * **The publication contract.** A content mutation and the obligation to
 * refresh the public site commit together or not at all. If the obligation
 * cannot be recorded, the save fails and rolls back, and the editor is told
 * so.
 *
 * This is a deliberate change of behaviour. Before, an enqueue failure was
 * caught and the work was retried inline, on this process, best-effort — and
 * `afterChange` runs *inside* the save's transaction, so that inline attempt
 * could read and publish state that had not committed yet and might never
 * commit. It also meant "your change is saved" was true while "the public
 * site will show it" was not, with nothing anywhere that would ever make it
 * true. A save that silently loses its refresh is worse than a save that
 * fails: the failure is visible and repeatable, the loss is neither.
 *
 * The inline path still exists for `REFRESH_OUTBOX=off`, which production
 * must acknowledge explicitly as a degraded emergency mode
 * (`shared/config/assert-production-config.ts`).
 */

export async function requestRevalidation(
  req: TransactionalReq | undefined,
  target: RevalidationTarget,
  reason: string,
): Promise<void> {
  const tags = unique(target.tags ?? [])
  const paths = unique(target.paths ?? [])
  if (tags.length === 0 && paths.length === 0) return

  if (outboxEnabled()) {
    if (!req) {
      throw new RefreshObligationError(
        'no-transaction',
        `a ${reason} change reached the refresh hooks with no request, so there was no transaction to commit the obligation with`,
      )
    }

    await enqueueRefreshJob(req, {
      kind: 'revalidate',
      dedupeKey: revalidateDedupeKey({ tags, paths }),
      target: { tags, paths },
      reason,
    })
    return
  }

  logger.warn('Refresh outbox is off; revalidating inline and best-effort', { reason })
  await triggerClientRevalidation({ tags, paths }, reason)
}

function poolFrom(req: TransactionalReq | undefined): SearchIndexPool | undefined {
  return (req?.payload.db as { pool?: SearchIndexPool } | undefined)?.pool
}

export async function requestSearchRefresh(
  req: TransactionalReq | undefined,
  type: SearchTypeKey,
  id: number | string,
  change: 'change' | 'delete',
): Promise<void> {
  if (outboxEnabled()) {
    if (!req) {
      throw new RefreshObligationError(
        'no-transaction',
        `a ${type} ${change} reached the search hooks with no request, so there was no transaction to commit the obligation with`,
      )
    }

    await enqueueRefreshJob(req, {
      kind: 'search-index',
      dedupeKey: searchIndexDedupeKey(type, id),
      target: { type, id: String(id) },
      reason: `${type}:${change}`,
    })
    return
  }

  logger.warn('Refresh outbox is off; refreshing the search row inline and best-effort', {
    type,
    id: String(id),
  })
  if (change === 'delete') await removeSearchDocumentSafely(poolFrom(req), type, id)
  else await refreshSearchDocumentSafely(poolFrom(req), type, id)
}
