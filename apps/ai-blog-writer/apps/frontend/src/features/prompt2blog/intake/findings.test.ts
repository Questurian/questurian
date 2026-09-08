import { describe, expect, it } from 'vitest'
import {
  anchorFindings,
  articleBlocks,
  comparable,
  worstSeverity,
} from './components/findings'
import type { IntakeFinding } from './intake.types'

/**
 * Tying findings to paragraphs.
 *
 * The failure this guards against is silent: a quote that does not match drops
 * the finding out of the page entirely, and the operator reads a review that
 * is missing something nobody knows is missing. So the two properties that
 * matter are that a loose match still lands, and that a match that fails
 * surfaces the finding somewhere rather than losing it.
 */

const ARTICLE = `# Two nights in Lima

The Surquillo market opens at six, and the *best* ceviche in the city is
served from a counter with eight stools.

Admission to the museum is 11,000 pesos, which is ten rides on the
funicular. Skip it.

See the [official timetable](https://example.pe/times) before you go.`

function finding(overrides: Partial<IntakeFinding>): IntakeFinding {
  return {
    finding_id: 'f1',
    label: 'a fault',
    severity: 'notable',
    quote: '',
    problem: 'something is wrong',
    whole_article: false,
    ...overrides,
  }
}

describe('comparing quoted text with the article', () => {
  it('ignores what differs between a model quoting and a source storing', () => {
    expect(comparable('The *best* ceviche')).toBe('the best ceviche')
    expect(comparable('“don’t”')).toBe('"don\'t"')
    expect(comparable('a — b')).toBe('a - b')
    expect(comparable('wrapped\nover   lines')).toBe('wrapped over lines')
  })

  it('keeps link text and drops the url, because the editor quotes what it read', () => {
    expect(comparable('the [official timetable](https://example.pe/times)')).toBe(
      'the official timetable',
    )
  })
})

describe('splitting the article the way a reader sees it', () => {
  it('gives one block per paragraph', () => {
    expect(articleBlocks(ARTICLE)).toHaveLength(4)
  })

  it('keeps fenced code whole', () => {
    const blocks = articleBlocks('Before.\n\n```\none\n\ntwo\n```\n\nAfter.')
    expect(blocks).toHaveLength(3)
    expect(blocks[1]).toContain('one\n\ntwo')
  })
})

describe('anchoring a finding to its paragraph', () => {
  it('lands on the paragraph the quote came from', () => {
    const { blocks, unanchored } = anchorFindings(ARTICLE, [
      finding({ quote: 'Admission to the museum is 11,000 pesos' }),
    ])

    expect(unanchored).toEqual([])
    expect(blocks[2].findings).toHaveLength(1)
    expect(blocks.filter((block) => block.findings.length)).toHaveLength(1)
  })

  it('still lands when the quote lost the markdown around it', () => {
    // What the editor read was "the best ceviche". What the article stores is
    // "the *best* ceviche", and an exact match would drop this finding.
    const { blocks, unanchored } = anchorFindings(ARTICLE, [
      finding({ quote: 'the best ceviche in the city' }),
    ])

    expect(unanchored).toEqual([])
    expect(blocks[1].findings).toHaveLength(1)
  })

  it('still lands when the quote was retyped with typographic punctuation', () => {
    const { blocks } = anchorFindings('He said don\'t go.', [
      finding({ quote: 'He said don’t go.' }),
    ])

    expect(blocks[0].findings).toHaveLength(1)
  })

  it('lands on the opening paragraph when the quote runs past a break', () => {
    const quote =
      'Admission to the museum is 11,000 pesos, which is ten rides on the funicular. Skip it. See the official timetable before you go.'
    const { blocks, unanchored } = anchorFindings(ARTICLE, [finding({ quote })])

    expect(unanchored).toEqual([])
    expect(blocks[2].findings).toHaveLength(1)
  })

  it('does not guess from a handful of characters', () => {
    // A short quote that matches nothing must not be rescued by a prefix
    // search: sixty characters is the point at which a coincidence stops
    // being plausible, and below it there is no prefix to try.
    const { unanchored } = anchorFindings(ARTICLE, [finding({ quote: 'zebra' })])

    expect(unanchored).toHaveLength(1)
  })
})

describe('findings that cannot be tied to a paragraph', () => {
  it('surfaces a whole-article fault rather than pinning it somewhere arbitrary', () => {
    const { blocks, unanchored } = anchorFindings(ARTICLE, [
      finding({ quote: 'WHOLE ARTICLE', whole_article: true }),
    ])

    expect(unanchored).toHaveLength(1)
    expect(blocks.every((block) => block.findings.length === 0)).toBe(true)
  })

  it('surfaces a quote that matches nothing rather than losing it', () => {
    // The failure being guarded against: a finding that appears nowhere at
    // all, in a review whose whole value is that every finding gets read.
    const { unanchored } = anchorFindings(ARTICLE, [
      finding({ quote: 'a sentence that is not in this article anywhere at all' }),
    ])

    expect(unanchored).toHaveLength(1)
  })

  it('keeps every finding somewhere, always', () => {
    const findings = [
      finding({ finding_id: 'f1', quote: 'Admission to the museum' }),
      finding({ finding_id: 'f2', quote: 'nowhere near this text' }),
      finding({ finding_id: 'f3', quote: 'WHOLE ARTICLE', whole_article: true }),
    ]

    const { blocks, unanchored } = anchorFindings(ARTICLE, findings)
    const seen = [
      ...blocks.flatMap((block) => block.findings.map((item) => item.finding_id)),
      ...unanchored.map((item) => item.finding_id),
    ]

    expect(seen.sort()).toEqual(['f1', 'f2', 'f3'])
  })
})

describe('colouring a paragraph that carries several findings', () => {
  it('takes the worst one', () => {
    expect(
      worstSeverity([
        finding({ severity: 'minor' }),
        finding({ severity: 'serious' }),
        finding({ severity: 'notable' }),
      ]),
    ).toBe('serious')
  })

  it('says nothing when there is nothing', () => {
    expect(worstSeverity([])).toBeNull()
  })
})
