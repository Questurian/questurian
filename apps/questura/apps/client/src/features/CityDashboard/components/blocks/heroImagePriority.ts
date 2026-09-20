/**
 * Image loading priority for a block's hero image.
 *
 * Eagerness is a property of where a block sits on the page, not of which
 * layout was chosen. Each layout used to hardcode `loading="eager"` on the
 * reasonable assumption that it was the first thing a reader sees; a city
 * page stacks nine such blocks, so nine images claimed hero priority and
 * eight of them were several screens below the fold — competing for
 * bandwidth with the thumbnails that were actually on screen.
 *
 * Only the first block gets to be eager. Everything else is lazy, and the
 * browser decides when it is needed.
 */
export type ImagePriority = {
  loading: 'eager' | 'lazy'
  fetchPriority: 'high' | 'auto'
}

export const EAGER_IMAGE: ImagePriority = { loading: 'eager', fetchPriority: 'high' }
export const LAZY_IMAGE: ImagePriority = { loading: 'lazy', fetchPriority: 'auto' }

export function heroImagePriority(blockIndex: number): ImagePriority {
  return blockIndex === 0 ? EAGER_IMAGE : LAZY_IMAGE
}

/**
 * Whether one item inside a block should pre-empt the network.
 *
 * Several layouts mark their own first card eager. That is right for the
 * block at the top of the page and wrong for the eight below it, so the
 * item's index is only half the answer — the block's position is the
 * other half.
 *
 * Within the first block every item is eager, not just its hero. The first
 * block is the screen the reader lands on: on /peru/lima all seven images
 * above the fold belong to it, and electing only its centre card left the
 * other six queued behind the rest of the page. `itemIndex` is kept in the
 * signature because a layout should not have to care which half of the
 * rule applies to it.
 */
export function isPriorityImage(blockIndex: number, _itemIndex: number): boolean {
  return blockIndex === 0
}
