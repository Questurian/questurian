import { describe, expect, it } from 'vitest'

import { DEFAULT_SAMPLE_LIMITS, applySampleRule } from './freeSample'

const text = (i: number) => ({ blockType: 'text', content: `para ${i}` })

describe('applySampleRule — standard articles', () => {
  it('keeps the opening prose and nothing else', () => {
    const doc: Record<string, unknown> = {
      contentBlocks: [text(0), text(1), text(2), text(3)],
    }

    const outcome = applySampleRule('articles', doc)

    expect(outcome).toEqual({ applied: true, unit: 'blocks', shown: 2, total: 4 })
    expect(doc.contentBlocks).toHaveLength(2)
    expect((doc.contentBlocks as { content: string }[]).map((b) => b.content)).toEqual([
      'para 0',
      'para 1',
    ])
  })

  it('withholds editorial blocks even when they come first', () => {
    // These carry standalone value, so an early key-takeaway must not become
    // the free part of a paid article.
    const doc: Record<string, unknown> = {
      contentBlocks: [
        { blockType: 'key-takeaway' },
        { blockType: 'pull-quote' },
        text(0),
        { blockType: 'in-the-know' },
        text(1),
        { blockType: 'faq' },
      ],
    }

    applySampleRule('articles', doc)

    expect((doc.contentBlocks as { blockType: string }[]).map((b) => b.blockType)).toEqual([
      'text',
      'text',
    ])
  })

  it('withholds images', () => {
    const doc: Record<string, unknown> = {
      contentBlocks: [text(0), { blockType: 'image' }, { blockType: 'img-trio' }, text(1)],
    }

    applySampleRule('articles', doc)

    expect((doc.contentBlocks as { blockType: string }[]).map((b) => b.blockType)).toEqual([
      'text',
      'text',
    ])
  })

  it('withholds an unknown future block type by default', () => {
    // Allowlist, not blocklist: a block type added later must not leak just
    // because nobody remembered this file.
    const doc: Record<string, unknown> = {
      contentBlocks: [{ blockType: 'brand-new-editorial-thing' }, text(0), text(1)],
    }

    applySampleRule('articles', doc)

    expect((doc.contentBlocks as { blockType: string }[]).map((b) => b.blockType)).toEqual([
      'text',
      'text',
    ])
  })

  it('reports applied when non-text blocks were removed but every text block survived', () => {
    const doc: Record<string, unknown> = {
      contentBlocks: [text(0), { blockType: 'faq' }],
    }

    const outcome = applySampleRule('articles', doc)

    expect(outcome).toEqual({ applied: true, unit: 'blocks', shown: 1, total: 2 })
  })

  it('handles an article with no prose at all', () => {
    const doc: Record<string, unknown> = { contentBlocks: [{ blockType: 'image' }] }

    const outcome = applySampleRule('articles', doc)

    expect(outcome).toEqual({ applied: true, unit: 'blocks', shown: 0, total: 1 })
    expect(doc.contentBlocks).toEqual([])
  })

  it('honours a caller-supplied limit', () => {
    const doc: Record<string, unknown> = { contentBlocks: [text(0), text(1), text(2)] }

    applySampleRule('articles', doc, { ...DEFAULT_SAMPLE_LIMITS, articleTextBlocks: 1 })

    expect(doc.contentBlocks).toHaveLength(1)
  })
})

describe('applySampleRule — listicle itineraries', () => {
  const day = (n: number) => ({
    items: [{ blockType: 'dining', blurb: `stop ${n}` }],
    whereStaying: [{ blockType: 'itinerary-where-staying', blurb: `hotel ${n}` }],
  })

  it('removes every day and keeps only the top-level lodging', () => {
    const doc: Record<string, unknown> = {
      whereStaying: [{ blockType: 'itinerary-where-staying', blurb: 'Hotel B' }],
      itineraryDays: [day(1), day(2), day(3)],
    }

    const outcome = applySampleRule('listicle-itineraries', doc)

    expect(outcome).toEqual({ applied: true, unit: 'days', shown: 0, total: 3 })
    expect(doc.itineraryDays).toEqual([])
    expect(doc.whereStaying).toHaveLength(1)
  })

  it('takes per-day lodging with the day it belongs to', () => {
    // Day lodging is nested inside the day rows, and no day survives.
    const doc: Record<string, unknown> = { itineraryDays: [day(1), day(2)] }

    applySampleRule('listicle-itineraries', doc)

    expect(JSON.stringify(doc.itineraryDays)).not.toContain('hotel')
  })

  it('strips the legacy top-level stop list too', () => {
    const doc: Record<string, unknown> = {
      items: [{ blockType: 'dining' }, { blockType: 'attractions' }],
      whereStaying: [{ blockType: 'itinerary-where-staying' }],
    }

    const outcome = applySampleRule('listicle-itineraries', doc)

    expect(outcome.applied).toBe(true)
    expect(doc.items).toEqual([])
    expect(doc.whereStaying).toHaveLength(1)
  })

  it('reports nothing applied for an itinerary with no body', () => {
    const doc: Record<string, unknown> = { whereStaying: [] }

    expect(applySampleRule('listicle-itineraries', doc)).toEqual({
      applied: false,
      unit: 'days',
      shown: 0,
      total: 0,
    })
  })
})

describe('applySampleRule — single-type listicles', () => {
  it('removes nothing, because they are never gated', () => {
    const doc: Record<string, unknown> = { items: [{ blockType: 'dining' }, { blockType: 'bar' }] }

    const outcome = applySampleRule('single-type-listicles', doc)

    expect(outcome.applied).toBe(false)
    expect(doc.items).toHaveLength(2)
  })
})
