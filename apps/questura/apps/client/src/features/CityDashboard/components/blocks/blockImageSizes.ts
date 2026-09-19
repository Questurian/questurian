/**
 * How wide each city-dashboard image actually renders (issue #563).
 *
 * `sizes` is what the browser uses to pick a rung out of `srcSet`. It has to be
 * told in CSS terms, before layout, which is why it cannot be derived and has
 * to be written down.
 *
 * The desktop numbers were **measured off a real render at 1440px**, not
 * derived from the stylesheets. Deriving them got several wrong: the side
 * thumbnail computes to 125px and draws at 174, the author portrait computes to
 * 260 and draws at 386. `sizes` is only worth writing if it is true.
 *
 * Every value is rounded up. The two failure modes are not symmetric:
 * over-stating a width costs one rung of extra bytes, while under-stating it
 * renders the photo visibly soft.
 */
export const BLOCK_IMAGE_SIZES = {
  /** Edge to edge at every breakpoint. */
  fullBleed: '100vw',

  /** The lead card of a block: 1.5fr of a 1.5fr/1fr split. Measured at 762px. */
  hero: '(min-width: 1024px) 780px, 100vw',

  /** The left card of the seven- and eight-slot blocks. Measured at 347px. */
  featuredLeftCard: '(min-width: 1024px) 360px, 100vw',

  /** The feature photo of the editorial and author blocks. Measured at 483px. */
  featureImage: '(min-width: 1024px) 500px, (min-width: 768px) 50vw, 100vw',

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

  /** The author portrait, 78% of its column. Measured at 386px. */
  portrait: '(min-width: 1024px) 400px, (min-width: 768px) 280px, 58vw',

  /** The fixed 120/150/180px thumbnail beside an article row. */
  listThumbnail: '(min-width: 1024px) 180px, (min-width: 768px) 150px, 120px',

  /** The 38%-of-column thumbnail in a side list. Measured at 114-174px. */
  sideThumbnail: '(min-width: 1024px) 180px, (min-width: 768px) 120px, 40vw',

  /** A round author avatar: `size-16 768:size-[4.5rem] 1024:size-20`. */
  avatar: '(min-width: 1024px) 80px, (min-width: 768px) 72px, 64px',
} as const
