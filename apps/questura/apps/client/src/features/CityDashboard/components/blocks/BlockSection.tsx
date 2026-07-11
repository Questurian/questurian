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
