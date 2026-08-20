import type { JSX, ReactNode } from 'react'

/**
 * Shared editorial marks for standard-article blocks.
 *
 * The double-rule diamond is the same ornament as `ArticlePageHeader` and
 * `ListicleSeparator`. It is reserved for pull quotes -- the one decorative
 * interruption in the column. Labels and ticks stay quieter: a sans kicker
 * on a hairline, and a solid diamond bullet.
 *
 * Rails and the diamond outline draw with `currentColor`, so tone comes from
 * the parent (`text-foreground`, `text-accent`, ...).
 */

type OrnamentProps = {
  /**
   * Fill behind the diamond. Must match the surrounding background or the
   * rule shows through the rotated square.
   */
  fillClassName?: string
  className?: string
}

/** Sans kicker shared by every labelled editorial block. */
export const editorialKickerClass =
  'font-[family-name:var(--font-dm-sans)] text-[10px] font-semibold uppercase leading-none tracking-[0.16em] sm:text-[11px]'

function Rail(): JSX.Element {
  return (
    <div className="box-border min-h-[3px] flex-1 border-x-0 border-b-0 border-t-[3px] border-double border-t-current" />
  )
}

export function EditorialDiamond({
  fillClassName = 'bg-background',
  className = '',
}: OrnamentProps): JSX.Element {
  return (
    // The rotated square's bounding box is 14px x sqrt(2) ~= 20px; the wrapper
    // reserves that height so the tips aren't clipped by neighbours.
    <div className={`flex size-5 shrink-0 items-center justify-center ${className}`} aria-hidden="true">
      <div
        className={`box-border size-[14px] rotate-45 border-[3px] border-double border-current ${fillClassName}`}
      />
    </div>
  )
}

/** Rail -- diamond -- rail. Used by pull quotes. */
export function EditorialRule({
  fillClassName = 'bg-background',
  className = '',
}: OrnamentProps): JSX.Element {
  return (
    <div aria-hidden="true" className={`flex items-center gap-1 ${className}`}>
      <Rail />
      <EditorialDiamond fillClassName={fillClassName} />
      <Rail />
    </div>
  )
}

/** Solid diamond used as a hanging list tick. */
export function EditorialTick({ className = '' }: { className?: string }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`mt-[0.45em] size-[5px] shrink-0 rotate-45 bg-current ${className}`}
    />
  )
}

/**
 * Section opener: sans label, hairline running out to the column edge.
 * Left-aligned so the blocks sit on the same grid as the prose.
 */
export function EditorialLabelRule({
  children,
  toneClassName = 'text-accent',
  className = '',
}: {
  children: ReactNode
  toneClassName?: string
  className?: string
}): JSX.Element {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className={`shrink-0 ${editorialKickerClass} ${toneClassName}`}>
        {children}
      </span>
      <div aria-hidden="true" className="h-px min-w-8 flex-1 bg-foreground/18" />
    </div>
  )
}
