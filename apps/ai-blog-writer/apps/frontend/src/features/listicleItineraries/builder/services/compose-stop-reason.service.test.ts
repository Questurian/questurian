import { describe, expect, it, vi, beforeEach } from 'vitest'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'

const composeMock = vi.fn()
vi.mock('../../../staging/api', () => ({
  composeItineraryStopReasonWithAi: (...args: unknown[]) => composeMock(...args),
}))

import {
  buildItineraryComposeStopReasonRequest,
  composeItineraryStopReason,
} from './compose-stop-reason.service'

function buildItem(overrides: Partial<ItineraryItemBlock> & { id: string }): ItineraryItemBlock {
  return {
    blockType: 'itinerary-dining',
    item: null,
    tours: [],
    mediaMode: 'photos',
    selectedPhotos: [],
    selectedInstagramPost: null,
    title: '',
    operator: '',
    price: '',
    url: '',
    tourDuration: 1,
    startingPoint: { label: '', latitude: '', longitude: '' },
    keyLocations: [],
    image: null,
    instagramPost: null,
    blurbMarkdown: '',
    ...overrides,
  }
}

function buildDraft(overrides: Partial<ListicleItineraryDraft> = {}): ListicleItineraryDraft {
  return {
    draftId: 'draft-1',
    editorModelName: 'claude-opus-4-8',
    listTone: 'elevated',
    title: 'One Perfect Day in Lima',
    location: 'peru|lima',
    locationRef: 1,
    sharedNeighborhoods: [],
    step1_complete: true,
    in_update_mode: false,
    step2_complete: true,
    step2_in_update_mode: false,
    step3_complete: false,
    step3_in_update_mode: false,
    header: { introMarkdown: '', featuredImage: null },
    dayCount: 1,
    planOverview: 'A single luxurious foodie day anchored in Barranco.',
    days: [],
    seoSection: {
      seoTitle: '',
      metaDescription: '',
      openGraph: { title: '', description: '', imageUrl: '', url: '' },
      twitterCard: { card: 'summary_large_image', title: '', description: '', imageUrl: '' },
      structuredData: '',
      robots: { index: 'index', follow: 'follow' },
    },
    status: 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: '2026-06-13T12:00:00.000Z',
    ...overrides,
  }
}

function buildLocations(): LocationOption[] {
  return [{ id: 1, locationKey: 'peru|lima', city: 'Lima', country: 'Peru', level: 'city' }]
}

function buildRelatedByBlockType(): Record<ItineraryBlockType, RelatedItemOption[]> {
  return {
    'itinerary-dining': [
      { id: 202, title: 'Mérito', location: 'Barranco, Lima', gallery: [], instagramGallery: [] },
    ],
    'itinerary-accommodations': [],
    'itinerary-where-staying': [],
    'itinerary-attractions': [],
    'itinerary-nightlife': [],
    'itinerary-key-location': [],
    'itinerary-tour-agency': [],
  }
}

const item = buildItem({
  id: 'stop-1',
  blockType: 'itinerary-dining',
  item: 202,
  angle: 'signature-dish',
  shellSlotDaypart: 'evening',
})

const baseParams = () => ({
  draft: buildDraft(),
  item,
  roughReason: '  great rooftop, perfect for sunset  ',
  relatedByBlockType: buildRelatedByBlockType(),
  locations: buildLocations(),
})

describe('compose-stop-reason service', () => {
  beforeEach(() => composeMock.mockReset())

  it('builds a request carrying the trimmed rough note, stop identity, and framing', () => {
    const request = buildItineraryComposeStopReasonRequest(baseParams())

    expect(request.roughReason).toBe('great rooftop, perfect for sunset')
    expect(request.title).toBe('Mérito')
    expect(request.category).toBe('Dining')
    expect(request.daypart).toBe('evening')
    expect(request.angle).toBe('signature-dish')
    expect(request.articleTitle).toContain('One Perfect Day in Lima')
    expect(request.locationLabel).toContain('Lima')
    expect(request.planOverview).toBe('A single luxurious foodie day anchored in Barranco.')
  })

  it('returns the refined reason on success', async () => {
    composeMock.mockResolvedValue({ reason: '  A buzzy Barranco rooftop anchoring the evening.  ', model_used: 'm' })

    const result = await composeItineraryStopReason(baseParams())

    expect(result).toEqual({ reason: 'A buzzy Barranco rooftop anchoring the evening.', fallback: false })
  })

  it('falls back to the operator raw text when the call throws', async () => {
    composeMock.mockRejectedValue(new Error('network'))

    const result = await composeItineraryStopReason(baseParams())

    expect(result).toEqual({ reason: 'great rooftop, perfect for sunset', fallback: true })
  })

  it('falls back to the operator raw text when the model returns empty', async () => {
    composeMock.mockResolvedValue({ reason: '   ', model_used: 'm' })

    const result = await composeItineraryStopReason(baseParams())

    expect(result).toEqual({ reason: 'great rooftop, perfect for sunset', fallback: true })
  })
})
