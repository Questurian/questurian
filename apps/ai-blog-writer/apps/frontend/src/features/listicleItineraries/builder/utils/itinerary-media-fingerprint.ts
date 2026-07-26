import { getRelatedPhotoIds } from '../../../../shared/builder/utils/item-media.utils'
import { stableSerialize } from '../../../../shared/payloadSync/payloadSyncSignature'
import {
  getItineraryBlocksInArticleOrder,
  isManualItineraryBlockType,
  type ItineraryBlockType,
  type ListicleItineraryDraft,
  type RelatedItemOption,
} from '../../types'

/**
 * Fingerprint of the Location Manager photo pools for every related item this
 * draft references in a stop. Galleries only contain uploaded images, so
 * staged Instagram media that is still Awaiting Review never enters the
 * fingerprint — only media that was reviewed, processed, and added to the
 * item's uploaded images can change it.
 *
 * Stamped onto the draft at Payload sync time; a later mismatch against the
 * live pools means reviewed media landed upstream after the last sync.
 */
export function buildItineraryMediaFingerprint(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string {
  const galleryByReferencedItem: Record<string, number[] | null> = {}

  for (const block of getItineraryBlocksInArticleOrder(draft)) {
    if (isManualItineraryBlockType(block.blockType) || !block.item) continue

    const key = `${block.blockType}:${block.item}`
    if (key in galleryByReferencedItem) continue

    const related = (relatedByBlockType[block.blockType] || [])
      .find((entry) => entry.id === block.item)
    galleryByReferencedItem[key] = related
      ? [...getRelatedPhotoIds(related)].sort((a, b) => a - b)
      : null
  }

  return stableSerialize(galleryByReferencedItem)
}

/**
 * True only when the fingerprint comparison is meaningful: the draft has a
 * stamped baseline and at least one referenced related item resolved in the
 * live pools (an entirely unresolved set means the pools failed to load or the
 * location filters changed, not that upstream media drifted).
 */
export function hasUpstreamMediaDrift(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): boolean {
  if (!draft.payloadId || !draft.lastPayloadSyncMediaFingerprint) return false

  const referencedBlocks = getItineraryBlocksInArticleOrder(draft)
    .filter((block) => !isManualItineraryBlockType(block.blockType) && block.item)
  if (referencedBlocks.length === 0) return false

  const anyResolved = referencedBlocks.some((block) => (
    (relatedByBlockType[block.blockType] || []).some((entry) => entry.id === block.item)
  ))
  if (!anyResolved) return false

  return buildItineraryMediaFingerprint(draft, relatedByBlockType)
    !== draft.lastPayloadSyncMediaFingerprint
}
