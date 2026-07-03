import { describe, expect, it } from 'vitest'
import type { SeoSection } from '../types'
import { applySeoAiPatch, parseSeoAiPatch } from './seo-ai.service'

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
