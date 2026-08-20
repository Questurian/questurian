import { describe, expect, it } from 'vitest'

import { gatePublicArticle } from './gatePublicArticle'

const blocks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ blockType: 'text', content: `block ${i}` }))

describe('gatePublicArticle', () => {
  it('leaves a free article whole and says so', () => {
    const doc: Record<string, unknown> = { access: 'free', contentBlocks: blocks(9) }

    const state = gatePublicArticle('articles', doc)

    expect(state.locked).toBe(false)
    expect(state.access).toBe('free')
    expect(doc.contentBlocks).toHaveLength(9)
    expect(doc.gate).toEqual(state)
  })

  it('reduces a gated article to its opening prose', () => {
    const doc: Record<string, unknown> = { access: 'member', contentBlocks: blocks(9) }

    const state = gatePublicArticle('articles', doc)

    expect(state).toEqual({ access: 'member', locked: true, unit: 'blocks', shown: 2, total: 9 })
    expect(doc.contentBlocks).toHaveLength(2)
  })

  it('treats a document with no tier as free rather than locking it', () => {
    // Fails open: content served free is the bug this closes, but content a
    // paying member cannot read is the bug that generates chargebacks.
    const doc: Record<string, unknown> = { contentBlocks: blocks(9) }

    const state = gatePublicArticle('articles', doc)

    expect(state.locked).toBe(false)
    expect(state.access).toBe('free')
    expect(doc.contentBlocks).toHaveLength(9)
  })

  it('treats an unrecognised tier as free', () => {
    const doc: Record<string, unknown> = { access: 'premium', contentBlocks: blocks(9) }

    const state = gatePublicArticle('articles', doc)

    expect(state.locked).toBe(false)
    expect(state.access).toBe('free')
    expect(doc.contentBlocks).toHaveLength(9)
  })

  it('still reports locked when the item is shorter than its own sample limit', () => {
    // Nothing was cut, but it is still paid content. Reporting it unlocked
    // would quietly turn every short gated item into a free one.
    const doc: Record<string, unknown> = { access: 'member', contentBlocks: blocks(2) }

    const state = gatePublicArticle('articles', doc)

    expect(state.locked).toBe(true)
    expect(state).toMatchObject({ shown: 2, total: 2 })
  })

  it('removes every day from an itinerary and counts in days', () => {
    const doc: Record<string, unknown> = {
      access: 'member',
      whereStaying: [{ blockType: 'itinerary-where-staying' }],
      itineraryDays: Array.from({ length: 5 }, () => ({ items: [], whereStaying: [] })),
    }

    const state = gatePublicArticle('listicle-itineraries', doc)

    expect(state).toEqual({ access: 'member', locked: true, unit: 'days', shown: 0, total: 5 })
    expect(doc.itineraryDays).toEqual([])
    expect(doc.whereStaying).toHaveLength(1)
  })

  it('never locks a single-type listicle, even with a stale member tier', () => {
    // The field is removed from that collection, but the column can still hold
    // a value set before removal. Ad revenue needs the whole page reachable.
    const doc: Record<string, unknown> = {
      access: 'member',
      items: [{ blockType: 'dining' }, { blockType: 'bar' }],
    }

    const state = gatePublicArticle('single-type-listicles', doc)

    expect(state.locked).toBe(false)
    expect(state.access).toBe('free')
    expect(doc.items).toHaveLength(2)
  })

  it('always attaches gate state, so the client never infers lock from absence', () => {
    const free: Record<string, unknown> = { access: 'free' }
    const gated: Record<string, unknown> = { access: 'member' }

    gatePublicArticle('articles', free)
    gatePublicArticle('articles', gated)

    expect(free.gate).toBeDefined()
    expect(gated.gate).toBeDefined()
  })
  describe("a gated item's structured data", () => {
    const gatedWithJsonLd = (structuredData: unknown): Record<string, unknown> => ({
      access: 'member',
      contentBlocks: blocks(9),
      seoSection: { structuredData },
    })

    const jsonLdOf = (doc: Record<string, unknown>) =>
      (doc.seoSection as Record<string, unknown>).structuredData as Record<string, unknown>

    it('drops articleBody at any length', () => {
      // Body text by definition. A short one is a truncated body, not a safe one.
      const doc = gatedWithJsonLd({ '@type': 'Article', articleBody: 'the whole piece' })

      gatePublicArticle('articles', doc)

      expect(jsonLdOf(doc).articleBody).toBeUndefined()
      expect(jsonLdOf(doc)['@type']).toBe('Article')
    })

    it('drops a body-length string under any key', () => {
      const doc = gatedWithJsonLd({ '@type': 'Article', notes: 'x'.repeat(1001) })

      gatePublicArticle('articles', doc)

      expect(jsonLdOf(doc).notes).toBeUndefined()
    })

    it('keeps the paywall markup ADR-0009 needs for indexability', () => {
      // Stripping the field wholesale would cost the `isAccessibleForFree` /
      // `hasPart` markup that keeps a short sample from reading as thin content.
      const doc = gatedWithJsonLd({
        '@type': 'Article',
        headline: 'Three days in Lima',
        isAccessibleForFree: false,
        hasPart: {
          '@type': 'WebPageElement',
          isAccessibleForFree: false,
          cssSelector: '.paywalled',
        },
        articleBody: 'y'.repeat(5000),
      })

      gatePublicArticle('articles', doc)

      expect(jsonLdOf(doc)).toEqual({
        '@type': 'Article',
        headline: 'Three days in Lima',
        isAccessibleForFree: false,
        hasPart: {
          '@type': 'WebPageElement',
          isAccessibleForFree: false,
          cssSelector: '.paywalled',
        },
      })
    })

    it('reaches prose nested in arrays', () => {
      const doc = gatedWithJsonLd({
        '@type': 'ItemList',
        itemListElement: [{ '@type': 'ListItem', name: 'Day 1', text: 'the locked day' }],
      })

      gatePublicArticle('listicle-itineraries', doc)

      const list = jsonLdOf(doc).itemListElement as Array<Record<string, unknown>>
      expect(list[0].text).toBeUndefined()
      expect(list[0].name).toBe('Day 1')
    })

    it('leaves a free item alone', () => {
      // Free items are not sampled, so nothing about them is locked.
      const doc: Record<string, unknown> = {
        access: 'free',
        contentBlocks: blocks(3),
        seoSection: { structuredData: { articleBody: 'all of it, deliberately' } },
      }

      gatePublicArticle('articles', doc)

      expect(jsonLdOf(doc).articleBody).toBe('all of it, deliberately')
    })

    it('tolerates a gated item with no structured data at all', () => {
      const doc: Record<string, unknown> = { access: 'member', contentBlocks: blocks(9) }

      expect(() => gatePublicArticle('articles', doc)).not.toThrow()
    })
  })
})
