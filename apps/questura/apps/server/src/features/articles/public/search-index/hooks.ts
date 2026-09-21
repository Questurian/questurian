import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import {
  refreshSearchDocumentSafely,
  removeSearchDocumentSafely,
  type SearchIndexPool,
} from './service'
import { COLLECTION_TO_SEARCH_TYPE, type SearchIndexedCollection } from './types'

function poolFrom(req: { payload?: { db?: { pool?: unknown } } }): SearchIndexPool | undefined {
  return (req.payload?.db as { pool?: SearchIndexPool } | undefined)?.pool
}

/**
 * Keep a collection's rows in `public_search_documents` in step with its
 * documents.
 *
 * `afterChange` covers publishing, unpublishing and body edits alike: blocks
 * live on the document, so editing a paragraph is a document change. The
 * refresh deletes and re-inserts, and the insert finds nothing for a draft, so
 * one hook handles every transition.
 */
export function syncSearchIndexForCollection(collection: SearchIndexedCollection) {
  const type = COLLECTION_TO_SEARCH_TYPE[collection]

  const afterChange: CollectionAfterChangeHook = async ({ doc, req }) => {
    const id = (doc as { id?: number | string } | undefined)?.id
    if (id === undefined) return doc

    await refreshSearchDocumentSafely(poolFrom(req), type, id)
    return doc
  }

  const afterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
    const id = (doc as { id?: number | string } | undefined)?.id
    if (id === undefined) return doc

    await removeSearchDocumentSafely(poolFrom(req), type, id)
    return doc
  }

  return { afterChange, afterDelete }
}
