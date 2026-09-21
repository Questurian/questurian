import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { requestSearchRefresh } from '@/features/refresh-outbox/request'

import { COLLECTION_TO_SEARCH_TYPE, type SearchIndexedCollection } from './types'

/**
 * Keep a collection's rows in `public_search_documents` in step with its
 * documents.
 *
 * `afterChange` covers publishing, unpublishing and body edits alike: blocks
 * live on the document, so editing a paragraph is a document change. The
 * refresh deletes and re-inserts, and the insert finds nothing for a draft, so
 * one hook handles every transition.
 *
 * The refresh is recorded in the save's transaction and done after commit
 * (features/refresh-outbox). Done inline, it ran on its own connection before
 * the save committed and read the previous state of the row.
 */
export function syncSearchIndexForCollection(collection: SearchIndexedCollection) {
  const type = COLLECTION_TO_SEARCH_TYPE[collection]

  const afterChange: CollectionAfterChangeHook = async ({ doc, req }) => {
    const id = (doc as { id?: number | string } | undefined)?.id
    if (id === undefined) return doc

    await requestSearchRefresh(req, type, id, 'change')
    return doc
  }

  const afterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
    const id = (doc as { id?: number | string } | undefined)?.id
    if (id === undefined) return doc

    await requestSearchRefresh(req, type, id, 'delete')
    return doc
  }

  return { afterChange, afterDelete }
}
