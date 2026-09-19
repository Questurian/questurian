/**
 * How wide each city-dashboard image actually renders (issue #563).
 *
 * `sizes` is what the browser uses to pick a rung out of `srcSet`. It has to be
 * told in CSS terms, before layout, which is why it cannot be derived and has
 * to be written down.
 *
 * The desktop numbers come off the block stylesheets: content caps at
 * `--block-max-width` (1400px) inset by `--block-gutter` (24px each side),
 * leaving 1352px to divide by each block's grid. Below the stated breakpoints
 * the cards go full bleed.
 *
 * Every value is rounded up. The two failure modes are not symmetric:
 * over-stating a width costs one rung of extra bytes, while under-stating it
 * renders the photo visibly soft.
 */
export const BLOCK_IMAGE_SIZES = {
  /** Edge to edge at every breakpoint. */
  fullBleed: '100vw',

  /** The lead card of a block: 1.5fr of a 1.5fr/1fr split, so ~811px. */
  hero: '(min-width: 1024px) 830px, 100vw',

  /** A centre feature: 1.55fr of 1fr/1.55fr/1fr with 32px gaps, so ~562px. */
  centreFeature: '(min-width: 1024px) 580px, 100vw',

  /** The 1fr partner of a hero-left split, so ~541px. */
  halfColumn: '(min-width: 1024px) 560px, 100vw',

  /** Three across the content width, so ~447px. */
  thirdColumn: '(min-width: 768px) 450px, 100vw',

  /** Four across the content width, so ~338px. */
  quarterColumn: '(min-width: 1024px) 340px, (min-width: 768px) 50vw, 100vw',

  /**
   * A carousel card, which is sized in viewport units rather than by a grid:
   * `w-[calc(100vw-5.25rem)] 380:291px 768:min(…,340px) 1024:calc((100% - 2.25rem)/3.3)`.
   */
  carouselCard:
    '(min-width: 1024px) 410px, (min-width: 768px) 340px, (min-width: 380px) 291px, calc(100vw - 5.25rem)',

  /** A maps carousel card: `w-[68vw] 380:w-[220px] 480:w-[245px]`. */
  mapCard: '(min-width: 480px) 245px, (min-width: 380px) 220px, 68vw',

  /** A square portrait at 78% of a ~330px column. */
  portrait: '(min-width: 1024px) 260px, (min-width: 768px) 280px, 58vw',

  /** The fixed 120/150/180px thumbnail beside an article row. */
  listThumbnail: '(min-width: 1024px) 180px, (min-width: 768px) 150px, 120px',

  /** The 38%-of-column thumbnail in a side list, so ~125px. */
  sideThumbnail: '(min-width: 1024px) 130px, (min-width: 768px) 120px, 40vw',

  /** A round author avatar: `size-16 768:size-[4.5rem] 1024:size-20`. */
  avatar: '(min-width: 1024px) 80px, (min-width: 768px) 72px, 64px',
} as const
