import { describe, expect, it } from 'vitest'
import {
  buildHeadingStructureHint,
  findRestrictedHeadings,
  formatHeadingStructureWarning,
  getRootHeadingLevel,
} from './heading-structure.service'

describe('getRootHeadingLevel', () => {
  it('reports the level of the first heading', () => {
    expect(getRootHeadingLevel('## Section\n\nBody copy.')).toBe(2)
    expect(getRootHeadingLevel('### Deep\n\n## Shallower')).toBe(3)
  })

  it('returns null when the block has no heading', () => {
    expect(getRootHeadingLevel('Just a paragraph.\n\nAnd another.')).toBeNull()
  })

  it('ignores a bare hash run that is not a heading', () => {
    expect(getRootHeadingLevel('##NoSpace is not a heading')).toBeNull()
  })
})

describe('findRestrictedHeadings', () => {
  it('flags a later sibling heading at the anchor level', () => {
    const restricted = findRestrictedHeadings('## First\n\nBody\n\n## Second', 2)
    expect(restricted).toEqual([{ level: 2, lineIndex: 4 }])
  })

  it('flags a later heading above the anchor level', () => {
    const restricted = findRestrictedHeadings('## First\n\n# Bigger', 2)
    expect(restricted).toEqual([{ level: 1, lineIndex: 2 }])
  })

  it('permits nested headings below the anchor level', () => {
    expect(findRestrictedHeadings('## First\n\n### Nested\n\n#### Deeper', 2)).toEqual([])
  })

  it('never flags the anchor heading itself', () => {
    expect(findRestrictedHeadings('## Only heading', 2)).toEqual([])
  })

  it('returns every offender, not just the first', () => {
    const restricted = findRestrictedHeadings('## A\n\n## B\n\n## C', 2)
    expect(restricted.map((heading) => heading.lineIndex)).toEqual([2, 4])
  })
})

describe('message builders', () => {
  it('names both levels in the warning', () => {
    expect(formatHeadingStructureWarning(2, 2)).toContain('H2')
  })

  it('describes the allowed range in the hint', () => {
    expect(buildHeadingStructureHint(2)).toContain('H3+')
    expect(buildHeadingStructureHint(5)).toContain('H6 only')
    expect(buildHeadingStructureHint(6)).toContain('Add a new block')
  })
})
