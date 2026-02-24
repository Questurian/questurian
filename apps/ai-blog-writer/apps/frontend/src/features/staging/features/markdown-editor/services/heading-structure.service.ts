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
      return {
        level,
        lineIndex,
        signature: `${level}|${lineIndex}|${line.trim()}`,
      }
    })
    .filter((heading): heading is MarkdownHeading => heading !== null)
}

export function getRootHeadingLevel(text: string): number | null {
  const firstHeading = collectMarkdownHeadings(text)[0]
  return firstHeading?.level ?? null
}

function getRestrictedHeadingViolations(text: string, rootHeadingLevel: number): MarkdownHeading[] {
  const headings = collectMarkdownHeadings(text)
  if (headings.length === 0) return []

  return headings.filter((heading, index) => {
    if (index === 0) {
      return heading.level < rootHeadingLevel
    }
    return heading.level <= rootHeadingLevel
  })
}

export function findNewHeadingViolation(
  currentText: string,
  nextText: string,
  rootHeadingLevel: number,
): MarkdownHeading | null {
  const currentViolations = getRestrictedHeadingViolations(currentText, rootHeadingLevel)
  const nextViolations = getRestrictedHeadingViolations(nextText, rootHeadingLevel)
  if (nextViolations.length <= currentViolations.length) return null

  const currentSignatures = new Set(currentViolations.map((heading) => heading.signature))
  return nextViolations.find((heading) => !currentSignatures.has(heading.signature)) ?? nextViolations[0] ?? null
}

export function formatHeadingRestrictionMessage(rootHeadingLevel: number, violationHeadingLevel: number): string {
  return `This block is anchored at H${rootHeadingLevel}. H${violationHeadingLevel} headings must be added as a new block, not inside this one.`
}

export function buildHeadingStructureHint(rootHeadingLevel: number): string {
  if (rootHeadingLevel >= 6) {
    return `Section lock: this block is H${rootHeadingLevel}. Add a new block for additional headings.`
  }

  const nextAllowedLevel = rootHeadingLevel + 1
  const allowedRangeLabel = nextAllowedLevel === 6 ? 'H6 only' : `H${nextAllowedLevel}+`
  return `Section lock: this block is H${rootHeadingLevel}. Use ${allowedRangeLabel} inside this block; add a new block for H${rootHeadingLevel} or higher headings.`
}
