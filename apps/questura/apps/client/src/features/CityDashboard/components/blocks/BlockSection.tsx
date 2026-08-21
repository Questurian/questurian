import type { JSX } from 'react'

/**
 * PAGE-WIDTH RULE — single source of truth for city homepage block geometry.
 *
 * Every block section is a full-width band (its background spans the viewport)
 * whose content is centered at 1400px and inset by a 24px gutter on each side,
 * so the content edges of every section line up exactly.
 *
 * Wrap every new block preview in <BlockSection>. If the block manages its own
 * horizontal spacing internally (e.g. an edge-bleed carousel), pass `flush`
 * and apply BLOCK_GUTTER_CLASS to the inner elements that hold content.
 *
 * The same values are mirrored as CSS custom properties (--block-max-width,
 * --block-gutter) in globals.css for block layouts written in raw CSS
 * (.city-featured-seven-layout, .city-featured-four-layout). Keep them in sync.
 */

export const BLOCK_MAX_WIDTH_CLASS = 'mx-auto w-full max-w-[var(--block-max-width)]'
export const BLOCK_GUTTER_CLASS = 'px-[var(--block-gutter)]'

/**
 * CARD PEEK RULE — shared card width for the edge-bleed block carousels
 * (hotel-grid, tour-grid, things-to-do-attractions, featured-article-carousel).
 *
 * Widths are fluid percentages of the scroll container's content box, not fixed
 * px, so a partial next card always peeks past the right edge and the row reads
 * as scrollable. Fixed widths only peek at the viewport sizes they happen to
 * divide badly; at ~1260px the old 400px card fit exactly 3 with nothing after.
 *
 * The divisor is the number of cards visible at once, and the subtracted term
 * is the gap-3 (12px) gutters between them:
 *   768+   2.3 cards, capped at 340px so cards don't outgrow the next tier
 *   1024+  3.3 cards -> three whole cards plus a ~30% slice of the fourth
 */
export const CAROUSEL_CARD_WIDTH_CLASS =
  'w-[calc(100vw-5.25rem)] 380:w-[291px] 768:w-[min(calc((100%_-_1.5rem)/2.3),340px)] 1024:w-[calc((100%_-_2.25rem)/3.3)]'

type BlockSectionProps = {
  children: React.ReactNode
  /** Classes for the outer full-width band: background color, vertical padding. */
  className?: string
  /** Extra classes for the centered content wrapper (e.g. vertical padding). */
  contentClassName?: string
  /** Skip the content gutter; the block applies BLOCK_GUTTER_CLASS internally. */
  flush?: boolean
  'aria-label'?: string
}

export function BlockSection({
  children,
  className,
  contentClassName,
  flush = false,
  ...rest
}: BlockSectionProps): JSX.Element {
  const contentClasses = [
    BLOCK_MAX_WIDTH_CLASS,
    flush ? null : BLOCK_GUTTER_CLASS,
    contentClassName,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={className ? `relative ${className}` : 'relative'} {...rest}>
      <div className={contentClasses}>{children}</div>
    </section>
  )
}
