import { logger } from '@/shared/utils/logger'

import {
  CLEAR_SEARCH_INDEX_SQL,
  DELETE_SEARCH_DOCUMENT_SQL,
  INSERT_SEARCH_DOCUMENT_SQL,
  REBUILD_SEARCH_INDEX_SQL,
} from './source-sql'
import { SEARCH_INDEX_HAS_ROWS_SQL } from './query-sql'
import type { SearchTypeKey } from './types'

type Client = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>
  release: (destroy?: boolean | Error) => void
}

export type SearchIndexPool = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>
  connect?: () => Promise<Client>
}

/**
 * Bring one document's row in line with the document.
 *
 * Delete then insert, in one transaction. The delete is unconditional and the
 * insert only finds a row if the document is currently published, so
 * unpublishing, deleting and editing are one code path rather than three. A
 * separate "remove from search when unpublished" branch is the branch that
 * gets forgotten.
 */
export async function refreshSearchDocument(
  pool: SearchIndexPool,
  type: SearchTypeKey,
  id: number | string,
): Promise<void> {
  const docId = Number(id)
  if (!Number.isInteger(docId)) return

  if (!pool.connect) {
    await pool.query(DELETE_SEARCH_DOCUMENT_SQL, [type, docId])
    await pool.query(INSERT_SEARCH_DOCUMENT_SQL, [type, docId])
    return
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query(DELETE_SEARCH_DOCUMENT_SQL, [type, docId])
    await client.query(INSERT_SEARCH_DOCUMENT_SQL, [type, docId])
    await client.query('COMMIT')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // The connection is going back to the pool broken either way; the
      // original failure below is the one worth reporting.
    }
    throw error
  } finally {
    client.release()
  }
}

/** Drop one document's row without trying to rebuild it. For deletes. */
export async function removeSearchDocument(
  pool: SearchIndexPool,
  type: SearchTypeKey,
  id: number | string,
): Promise<void> {
  const docId = Number(id)
  if (!Number.isInteger(docId)) return

  await pool.query(DELETE_SEARCH_DOCUMENT_SQL, [type, docId])
}

/** Rebuild every row from the published corpus. Backfill and repair. */
export async function rebuildSearchIndex(pool: SearchIndexPool): Promise<number> {
  if (!pool.connect) {
    await pool.query(CLEAR_SEARCH_INDEX_SQL)
    const inserted = await pool.query(REBUILD_SEARCH_INDEX_SQL)
    return inserted.rowCount ?? 0
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query(CLEAR_SEARCH_INDEX_SQL)
    const inserted = await client.query(REBUILD_SEARCH_INDEX_SQL)
    await client.query('COMMIT')
    return inserted.rowCount ?? 0
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // See above.
    }
    throw error
  } finally {
    client.release()
  }
}

/**
 * Whether the index has anything in it.
 *
 * An empty table and a corpus with no matches look identical from the query's
 * result, and one of those is a deployment that has not been backfilled. The
 * check runs only when a search returns nothing, so an ordinary search never
 * pays for it.
 */
export async function searchIndexHasRows(pool: SearchIndexPool): Promise<boolean> {
  const result = await pool.query(SEARCH_INDEX_HAS_ROWS_SQL)
  return result.rows.length > 0
}

/**
 * Keep the index fresh without ever failing the save that triggered it.
 *
 * An editor publishing an article must not see an error because a search row
 * could not be written; the row is recoverable (`pnpm rebuild:search-index`)
 * and the edit is not. Failures are logged loudly instead.
 */
export async function refreshSearchDocumentSafely(
  pool: SearchIndexPool | undefined,
  type: SearchTypeKey,
  id: number | string,
): Promise<void> {
  if (!pool) return

  try {
    await refreshSearchDocument(pool, type, id)
  } catch (error) {
    logger.error('Failed to refresh search index row', {
      type,
      id: String(id),
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function removeSearchDocumentSafely(
  pool: SearchIndexPool | undefined,
  type: SearchTypeKey,
  id: number | string,
): Promise<void> {
  if (!pool) return

  try {
    await removeSearchDocument(pool, type, id)
  } catch (error) {
    logger.error('Failed to remove search index row', {
      type,
      id: String(id),
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
