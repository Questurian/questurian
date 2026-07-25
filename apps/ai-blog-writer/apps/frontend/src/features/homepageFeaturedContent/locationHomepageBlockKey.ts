import {
  homepageBlockEditorIdentity,
  isHotelGridBlock,
  isTourGridBlock,
  isThingsToDoAttractionsBlock,
  isArticleCuratedHomepageBlock,
  isLocationGridBlock,
  isNewsletterSignupBlock,
  type PageBlockResponse,
} from './pageBlocks'

/**
 * React key for a rendered block, and it matters: the sortable list keys its
 * wrappers by `block.id` alone, so a convert (same id, new blockType/slotCount)
 * would otherwise reuse the mounted editor and its TanStack cache entry. Keying
 * on the editor identity forces the remount.
 *
 * Branch order mirrors LocationHomepageBlockRenderer — in particular an unknown
 * block, and a location-grid block without a child level, fall through to the
 * placeholder and must key on `block.id`, because `homepageBlockEditorIdentity`
 * reads `selection.totalSlots` which `UnknownBlockResponse` does not have.
 */
export function locationHomepageBlockKey(
  block: PageBlockResponse,
  locationGridChildLevel: 'neighborhood' | null,
): string {
  if (
    isArticleCuratedHomepageBlock(block)
    || (isLocationGridBlock(block) && locationGridChildLevel)
    || isNewsletterSignupBlock(block)
    || isHotelGridBlock(block)
    || isTourGridBlock(block)
    || isThingsToDoAttractionsBlock(block)
  ) {
    return homepageBlockEditorIdentity(block).join(':')
  }
  return block.id
}
