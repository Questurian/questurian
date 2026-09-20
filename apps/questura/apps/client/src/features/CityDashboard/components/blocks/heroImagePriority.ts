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
 * Two halves of the answer, and the block's position is only one of them.
 *
 * Every layout below the first block is lazy: its images are screens away.
 * Inside the first block the honest answer depends on the width, because the
 * first block reflows. Measured on /peru/lima, whose first block is the
 * seven-article layout -- a centre card, two side cards and a rail of four
 * thumbnails:
 *
 *   1440x900   all 7 images on screen
 *    768x1024  2 on screen, 5 below; the furthest starts 2,275px down
 *    375x812   2 on screen, 5 below; the furthest starts 2,095px down
 *
 * `loading` is an attribute of one element in server-rendered HTML. The same
 * image is the centre card on a desktop and a stacked square on a phone, so
 * there is no answer that is right at both widths -- only a choice about which
 * width to be wrong at.
 *
 * This takes the narrow one. A phone on a slow connection downloading five
 * photos that start two and a half screens down, ahead of the one the reader
 * is looking at, is a real cost to a real reader. A desktop's remaining five
 * are inside the viewport at layout time, so the browser fetches them
 * immediately anyway; what they lose is preload-scanner discovery, and they
 * are a 347x231 card and four 114x114 thumbnails.
 *
 * This is not a return to the pre-#574 rule. That one elected a single item
 * per layout while leaving eight off-screen images in *other* blocks eager, so
 * the visible thumbnails queued behind photos nobody could see. Nothing
 * off-screen is eager now, in any block, at any width.
 */

/**
 * How many of the first block's images a phone can actually see.
 *
 * Two, measured -- the first fully, the second partly. Raising this number
 * means claiming a third image is above the fold at 375px wide; measure it
 * before you do.
 */
export const EAGER_ITEMS_IN_FIRST_BLOCK = 2

export function isPriorityImage(blockIndex: number, itemIndex: number): boolean {
  return blockIndex === 0 && itemIndex < EAGER_ITEMS_IN_FIRST_BLOCK
}
