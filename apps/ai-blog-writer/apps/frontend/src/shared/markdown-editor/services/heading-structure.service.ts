import type { MarkdownHeading } from '../types'

function getMarkdownHeadingLevel(line: string): number | null {
  const match = line.trimStart().match(/^(#{1,6})\s+/)
  if (!match) return null
  return match[1].length
}

function collectMarkdownHeadings(text: string): MarkdownHeading[] {
  return text
    .split('\n')
    .map((line, lineIndex) => {
      const level = getMarkdownHeadingLevel(line)
      if (level === null) return null
      return { level, lineIndex }
    })
    .filter((heading): heading is MarkdownHeading => heading !== null)
}

/** The level of the block's own first heading, which anchors its section. */
export function getRootHeadingLevel(text: string): number | null {
  const firstHeading = collectMarkdownHeadings(text)[0]
  return firstHeading?.level ?? null
}

/**
 * Later headings at or above the block's anchor level.
 *
 * The stage splits articles into blocks on the anchor level, so a sibling
 * heading buried inside a block will not get its own section downstream. That
 * is worth telling the author about — it is not worth refusing their keystroke,
 * so this only ever reports.
 */
export function findRestrictedHeadings(
  text: string,
  rootHeadingLevel: number,
): MarkdownHeading[] {
  return collectMarkdownHeadings(text).filter(
    (heading, index) => index > 0 && heading.level <= rootHeadingLevel,
  )
}

export function formatHeadingStructureWarning(
  rootHeadingLevel: number,
  restrictedHeadingLevel: number,
): string {
  return `This block is anchored at H${rootHeadingLevel}, so the H${restrictedHeadingLevel} below it won't get its own section. Split it into a new block to give it one.`
}

export function buildHeadingStructureHint(rootHeadingLevel: number): string {
  if (rootHeadingLevel >= 6) {
    return `Section lock: this block is H${rootHeadingLevel}. Add a new block for additional headings.`
  }

  const nextAllowedLevel = rootHeadingLevel + 1
  const allowedRangeLabel = nextAllowedLevel === 6 ? 'H6 only' : `H${nextAllowedLevel}+`
  return `Section lock: this block is H${rootHeadingLevel}. Use ${allowedRangeLabel} inside this block; add a new block for H${rootHeadingLevel} or higher headings.`
}
