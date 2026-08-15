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

  it('reduces a gated article to its Free sample', () => {
    const doc: Record<string, unknown> = { access: 'member', contentBlocks: blocks(9) }

    const state = gatePublicArticle('articles', doc)

    expect(state).toEqual({ access: 'member', locked: true, unit: 'blocks', shown: 3, total: 9 })
    expect(doc.contentBlocks).toHaveLength(3)
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

  it('locks an itinerary down to Day 1 and counts in days', () => {
    const doc: Record<string, unknown> = {
      access: 'member',
      itineraryDays: Array.from({ length: 5 }, () => ({ items: [], whereStaying: [] })),
    }

    const state = gatePublicArticle('listicle-itineraries', doc)

    expect(state).toEqual({ access: 'member', locked: true, unit: 'days', shown: 1, total: 5 })
    expect(doc.itineraryDays).toHaveLength(1)
  })

  it('always attaches gate state, so the client never infers lock from absence', () => {
    const free: Record<string, unknown> = { access: 'free' }
    const gated: Record<string, unknown> = { access: 'member' }

    gatePublicArticle('articles', free)
    gatePublicArticle('articles', gated)

    expect(free.gate).toBeDefined()
    expect(gated.gate).toBeDefined()
  })
})
