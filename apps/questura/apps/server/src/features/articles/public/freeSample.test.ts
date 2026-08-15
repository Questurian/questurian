import { describe, expect, it } from 'vitest'

import { DEFAULT_SAMPLE_LIMITS, applySampleRule } from './freeSample'

const blocks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ blockType: 'text', content: `block ${i}` }))

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ blockType: 'dining', blurb: `stop ${i}` }))

const days = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    items: items(3),
    whereStaying: [{ blockType: 'itinerary-where-staying', blurb: `hotel ${i}` }],
  }))

describe('applySampleRule — standard articles', () => {
  it('keeps the leading blocks and drops the rest', () => {
    const doc: Record<string, unknown> = { contentBlocks: blocks(9) }

    const outcome = applySampleRule('articles', doc)

    expect(outcome).toEqual({ applied: true, unit: 'blocks', shown: 3, total: 9 })
    expect(doc.contentBlocks).toHaveLength(3)
    expect((doc.contentBlocks as { content: string }[])[0].content).toBe('block 0')
  })

  it('reports nothing applied when the body is already at or under the limit', () => {
    const doc: Record<string, unknown> = { contentBlocks: blocks(2) }

    const outcome = applySampleRule('articles', doc)

    expect(outcome).toEqual({ applied: false, unit: 'blocks', shown: 2, total: 2 })
    expect(doc.contentBlocks).toHaveLength(2)
  })

  it('survives a document with no body at all', () => {
    const doc: Record<string, unknown> = {}

    expect(applySampleRule('articles', doc)).toEqual({
      applied: false,
      unit: 'blocks',
      shown: 0,
      total: 0,
    })
  })
})

describe('applySampleRule — single-type listicles', () => {
  it('keeps the leading ranked items', () => {
    const doc: Record<string, unknown> = { items: items(12) }

    const outcome = applySampleRule('single-type-listicles', doc)

    expect(outcome).toEqual({ applied: true, unit: 'items', shown: 3, total: 12 })
    expect(doc.items).toHaveLength(3)
  })
})

describe('applySampleRule — listicle itineraries', () => {
  it('keeps Day 1 whole, including its lodging', () => {
    const doc: Record<string, unknown> = { itineraryDays: days(5) }

    const outcome = applySampleRule('listicle-itineraries', doc)

    expect(outcome).toEqual({ applied: true, unit: 'days', shown: 1, total: 5 })
    expect(doc.itineraryDays).toHaveLength(1)

    const dayOne = (doc.itineraryDays as { items: unknown[]; whereStaying: unknown[] }[])[0]
    expect(dayOne.items).toHaveLength(3)
    expect(dayOne.whereStaying).toHaveLength(1)
  })

  it('strips the legacy top-level body on a day-shaped itinerary', () => {
    // Both shapes can be populated at once. Truncating days while leaving the
    // legacy arrays would hand back the very stops the day cut removed.
    const doc: Record<string, unknown> = {
      itineraryDays: days(4),
      items: items(20),
      whereStaying: [{ blockType: 'itinerary-where-staying' }],
    }

    const outcome = applySampleRule('listicle-itineraries', doc)

    expect(outcome.applied).toBe(true)
    expect(doc.itineraryDays).toHaveLength(1)
    expect(doc.items).toEqual([])
    expect(doc.whereStaying).toEqual([])
  })

  it('falls back to the item rule for a legacy itinerary with no days', () => {
    const doc: Record<string, unknown> = {
      itineraryDays: [],
      items: items(10),
      whereStaying: [{ blockType: 'itinerary-where-staying' }],
    }

    const outcome = applySampleRule('listicle-itineraries', doc)

    expect(outcome).toEqual({ applied: true, unit: 'items', shown: 3, total: 10 })
    expect(doc.items).toHaveLength(3)
    expect(doc.whereStaying).toEqual([])
  })

  it('reports applied when only lodging had to be removed', () => {
    const doc: Record<string, unknown> = {
      items: items(2),
      whereStaying: [{ blockType: 'itinerary-where-staying' }],
    }

    const outcome = applySampleRule('listicle-itineraries', doc)

    expect(outcome.applied).toBe(true)
    expect(doc.items).toHaveLength(2)
    expect(doc.whereStaying).toEqual([])
  })
})

describe('applySampleRule — limits', () => {
  it('honours caller-supplied limits over the defaults', () => {
    const doc: Record<string, unknown> = { contentBlocks: blocks(9) }

    const outcome = applySampleRule('articles', doc, {
      ...DEFAULT_SAMPLE_LIMITS,
      articleBlocks: 5,
    })

    expect(outcome.shown).toBe(5)
    expect(doc.contentBlocks).toHaveLength(5)
  })

  it('treats a zero limit as a full lock rather than as no limit', () => {
    const doc: Record<string, unknown> = { contentBlocks: blocks(4) }

    const outcome = applySampleRule('articles', doc, {
      ...DEFAULT_SAMPLE_LIMITS,
      articleBlocks: 0,
    })

    expect(outcome).toEqual({ applied: true, unit: 'blocks', shown: 0, total: 4 })
    expect(doc.contentBlocks).toEqual([])
  })
})
