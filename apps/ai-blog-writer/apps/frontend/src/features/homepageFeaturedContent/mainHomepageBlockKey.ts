import {
  homepageBlockEditorIdentity,
  isHotelGridBlock,
  isTourGridBlock,
  isThingsToDoAttractionsBlock,
  isArticleCuratedHomepageBlock,
  isLocationGridBlock,
  isNewsletterSignupBlock,
  type PageBlockResponse
} from './pageBlocks'

/**
 * React key for a rendered block on the main homepage. Same reasoning as
 * `locationHomepageBlockKey`: the sortable list keys its wrappers by `block.id`
 * alone, so a convert (same id, new blockType/slotCount) would otherwise reuse
 * the mounted editor and its TanStack cache entry.
 *
 * Branch order mirrors MainHomepageBlockRenderer — an unknown block falls
 * through to the placeholder and must key on `block.id`, because
 * `homepageBlockEditorIdentity` reads `selection.totalSlots` which
 * `UnknownBlockResponse` does not have. Unlike the location page, a
 * location-grid block here has no child-level condition.
 */
export function mainHomepageBlockKey(block: PageBlockResponse): string {
  if (
    isArticleCuratedHomepageBlock(block) ||
    isLocationGridBlock(block) ||
    isNewsletterSignupBlock(block) ||
    isHotelGridBlock(block) ||
    isTourGridBlock(block) ||
    isThingsToDoAttractionsBlock(block)
  ) {
    return homepageBlockEditorIdentity(block).join(':')
  }
  return block.id
}
