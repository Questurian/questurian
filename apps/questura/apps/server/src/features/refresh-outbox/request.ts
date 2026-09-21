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
  revalidateDedupeKey,
  searchIndexDedupeKey,
  type TransactionalReq,
} from './enqueue'

/**
 * What content hooks call instead of doing refresh work inline.
 *
 * With the outbox on (default) the work is recorded in the save's
 * transaction and done after commit, with retries. If recording fails — or
 * `REFRESH_OUTBOX=off` — it falls back to the old inline, best-effort
 * behaviour, so a problem here can never block an editor's save.
 */

export async function requestRevalidation(
  req: TransactionalReq | undefined,
  target: RevalidationTarget,
  reason: string,
): Promise<void> {
  const tags = unique(target.tags ?? [])
  const paths = unique(target.paths ?? [])
  if (tags.length === 0 && paths.length === 0) return

  if (req && outboxEnabled()) {
    try {
      await enqueueRefreshJob(req, {
        kind: 'revalidate',
        dedupeKey: revalidateDedupeKey({ tags, paths }),
        target: { tags, paths },
        reason,
      })
      return
    } catch (error) {
      logger.error('Refresh outbox unavailable; revalidating inline', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

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
  if (req && outboxEnabled()) {
    try {
      await enqueueRefreshJob(req, {
        kind: 'search-index',
        dedupeKey: searchIndexDedupeKey(type, id),
        target: { type, id: String(id) },
        reason: `${type}:${change}`,
      })
      return
    } catch (error) {
      logger.error('Refresh outbox unavailable; refreshing the search row inline', {
        type,
        id: String(id),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (change === 'delete') await removeSearchDocumentSafely(poolFrom(req), type, id)
  else await refreshSearchDocumentSafely(poolFrom(req), type, id)
}
