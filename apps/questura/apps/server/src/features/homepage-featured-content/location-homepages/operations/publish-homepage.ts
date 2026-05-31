import type { PayloadInstance } from '@/types'

import {
  formatHomepageDoc,
  resolveLocationGridScope,
  resolvePageBlocks,
  type LocationHomepageDoc,
  type RawBlock,
} from '../../resolve-page-blocks/service'
import {
  getDraftPageBlocks,
  getLocationHomepagePayload,
  loadLocationHomepage,
} from '../lib/persistence'
import {
  assertPublishableResolvedBlocks,
  snapshotDraftBlocksForPublish,
} from '../lib/publish-status'
import type {
  FormattedLocationHomepage,
  LocationHomepageOperationResult,
} from '../types'

// Re-exported from lib/publish-status so existing importers keep working.
export {
  assertPublishableResolvedBlocks,
  augmentBlocksWithPublishStatus,
  cloneBlocksForPublishedSnapshot,
  getBlockPublishBlockers,
  snapshotDraftBlocksForPublish,
} from '../lib/publish-status'

type ErrorBody = { message: string }

async function resolveDraftBlocks(
  payload: PayloadInstance,
  blocks: RawBlock[],
  location: LocationHomepageDoc['location'],
) {
  const locationGridScope = await resolveLocationGridScope(payload, location)
  return resolvePageBlocks(payload, blocks, locationGridScope)
}

export async function publishLocationHomepage(
  id: string,
  userId: string | number | null,
): Promise<LocationHomepageOperationResult<FormattedLocationHomepage | ErrorBody>> {
  const payload = await getLocationHomepagePayload()
  const doc = await loadLocationHomepage(payload, id, 0)
  const draftBlocks = getDraftPageBlocks(doc)
  const resolvedDraftBlocks = await resolveDraftBlocks(payload, draftBlocks, doc.location)

  assertPublishableResolvedBlocks(resolvedDraftBlocks)

  const nextRevision = Math.max(0, Number(doc.publishedRevision) || 0) + 1
  const updated = await payload.update({
    collection: 'location-homepages',
    id,
    data: {
      publishedPageBlocks: snapshotDraftBlocksForPublish(draftBlocks),
      lastPublishedAt: new Date().toISOString(),
      lastPublishedBy: userId ?? undefined,
      publishedRevision: nextRevision,
    } as never,
    depth: 0,
    overrideAccess: true,
  })

  const updatedDoc = updated as unknown as LocationHomepageDoc
  const resolvedPublishedBlocks = await resolveDraftBlocks(
    payload,
    (updatedDoc.publishedPageBlocks ?? draftBlocks) as RawBlock[],
    updatedDoc.location,
  )

  return {
    status: 200,
    body: formatHomepageDoc(updated as never, resolvedPublishedBlocks, {
      publishedPageBlocks: resolvedPublishedBlocks,
    }),
  }
}
