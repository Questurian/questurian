import { describe, expect, it } from 'vitest'
import type { SeoSection } from '../types'
import {
  applySeoAiPatch,
  parseSeoAiPatch,
  seoAiPatchCoversTarget,
} from './seo-ai.service'

function buildSeoSection(overrides: Partial<SeoSection> = {}): SeoSection {
  return {
    seoTitle: 'Two Days in Lima',
    metaDescription: 'A two-day Lima itinerary.',
    openGraph: {
      title: 'Two Days in Lima',
      description: 'A two-day Lima itinerary.',
      imageUrl: 'https://cdn.example.com/lima.jpg',
      url: 'https://www.questurian.com/peru/lima/itinerary/two-days-lima',
    },
    twitterCard: {
      card: 'summary_large_image',
      title: 'Two Days in Lima',
      description: 'A two-day Lima itinerary.',
      imageUrl: 'https://cdn.example.com/lima.jpg',
    },
    structuredData: '',
    robots: { index: 'index', follow: 'follow' },
    ...overrides,
  }
}

describe('applySeoAiPatch og:url protection', () => {
  const hallucinatedPatch = parseSeoAiPatch(JSON.stringify({
    seoTitle: 'New Title',
    metaDescription: 'New description.',
    openGraph: {
      title: 'New OG Title',
      description: 'New OG description.',
      url: 'https://example.com/made-up-path',
    },
  }))

  it('does not overwrite og:url on the "all" target', () => {
    const current = buildSeoSection()
    const next = applySeoAiPatch(current, hallucinatedPatch, 'all')

    expect(next.seoTitle).toBe('New Title')
    expect(next.openGraph.title).toBe('New OG Title')
    expect(next.openGraph.url).toBe(current.openGraph.url)
  })

  it('does not overwrite og:url on the "openGraph" section target', () => {
    const current = buildSeoSection()
    const next = applySeoAiPatch(current, hallucinatedPatch, 'openGraph')

    expect(next.openGraph.title).toBe('New OG Title')
    expect(next.openGraph.description).toBe('New OG description.')
    expect(next.openGraph.url).toBe(current.openGraph.url)
  })

  it('still applies og:url on the explicit single-field target', () => {
    const current = buildSeoSection()
    const next = applySeoAiPatch(current, hallucinatedPatch, 'openGraphUrl')

    expect(next.openGraph.url).toBe('https://example.com/made-up-path')
    expect(next.seoTitle).toBe(current.seoTitle)
    expect(next.openGraph.title).toBe(current.openGraph.title)
  })

  it('rejects non-absolute og:url values during parsing', () => {
    const patch = parseSeoAiPatch(JSON.stringify({ openGraph: { url: '/relative/path' } }))
    const next = applySeoAiPatch(buildSeoSection(), patch, 'openGraphUrl')

    expect(next.openGraph.url).toBe(buildSeoSection().openGraph.url)
  })
})

describe('structuredData patches', () => {
  const JSON_LD = {
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'BlogPosting', headline: 'Two Days in Lima' }],
  }

  it('accepts JSON-LD delivered as a JSON string', () => {
    const patch = parseSeoAiPatch(JSON.stringify({ structuredData: JSON.stringify(JSON_LD) }))

    expect(patch.structuredData).toBeDefined()
    expect(JSON.parse(patch.structuredData!)).toEqual(JSON_LD)
    expect(seoAiPatchCoversTarget(patch, 'structuredData')).toBe(true)
  })

  it('accepts JSON-LD delivered as an object', () => {
    const patch = parseSeoAiPatch(JSON.stringify({ structuredData: JSON_LD }))

    expect(JSON.parse(patch.structuredData!)).toEqual(JSON_LD)
  })

  // Gemini used to return `{}` here because the tool schema declared an object
  // with no properties. Serializing that would have written a literal "{}"
  // into the field and reported success.
  it('treats an empty object as no structured data at all', () => {
    const patch = parseSeoAiPatch(JSON.stringify({ structuredData: {} }))

    expect(patch.structuredData).toBeUndefined()
    expect(seoAiPatchCoversTarget(patch, 'structuredData')).toBe(false)
  })

  it('leaves the existing value in place when the patch covers nothing', () => {
    const current = buildSeoSection({ structuredData: '{"@type":"BlogPosting"}' })
    const patch = parseSeoAiPatch(JSON.stringify({ structuredData: {} }))

    expect(applySeoAiPatch(current, patch, 'structuredData').structuredData)
      .toBe(current.structuredData)
  })
})

describe('seoAiPatchCoversTarget', () => {
  it('is false when the model answered a different field than the one requested', () => {
    const patch = parseSeoAiPatch(JSON.stringify({ twitterCard: { card: 'summary' } }))

    expect(seoAiPatchCoversTarget(patch, 'structuredData')).toBe(false)
    expect(seoAiPatchCoversTarget(patch, 'seoTitle')).toBe(false)
    expect(seoAiPatchCoversTarget(patch, 'twitterCardCard')).toBe(true)
  })

  it('is true for "all" as long as one field landed', () => {
    const patch = parseSeoAiPatch(JSON.stringify({ seoTitle: 'Two Days in Lima' }))

    expect(seoAiPatchCoversTarget(patch, 'all')).toBe(true)
  })

  it('is false for "all" when nothing landed', () => {
    expect(seoAiPatchCoversTarget(parseSeoAiPatch('{}'), 'all')).toBe(false)
  })
})

describe('parseSeoAiPatch seoTitle clipping', () => {
  it('keeps titles within the limit untouched', () => {
    const patch = parseSeoAiPatch(JSON.stringify({ seoTitle: 'Two Days in Lima: Food, Art & Coastline' }))
    expect(patch.seoTitle).toBe('Two Days in Lima: Food, Art & Coastline')
  })

  it('clips overlong titles at a word boundary instead of mid-word', () => {
    const original = 'The Ultimate Two Day Lima Itinerary for Foodies and Architecture Lovers'
    const patch = parseSeoAiPatch(JSON.stringify({ seoTitle: original }))

    expect(patch.seoTitle).toBeDefined()
    expect(patch.seoTitle!.length).toBeLessThanOrEqual(60)
    // No mid-word cut: the clipped title must be a prefix of the original
    // ending exactly at a word boundary.
    const nextChar = original.charAt(patch.seoTitle!.length)
    expect(original.startsWith(patch.seoTitle!)).toBe(true)
    expect(nextChar === ' ' || nextChar === '').toBe(true)
  })
})
