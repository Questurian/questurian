import { describe, expect, it } from 'vitest'
import {
  applyItineraryComposedIntro,
  buildItineraryComposeIntroRequest,
  getItineraryIntroComposableStops,
  getItineraryIntroComposeDisabledReason,
} from './intro-composer.service'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'

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
    days: [
      {
        id: 'day_1',
        whereStaying: [
          buildItem({
            id: 'ws-1',
            blockType: 'itinerary-where-staying',
            item: 10,
            selectionReason: 'most comfortable, central',
          }),
        ],
        items: [
          buildItem({
            id: 'stop-1',
            blockType: 'itinerary-dining',
            item: 202,
            selectionReason: 'tasting-menu fine dining',
          }),
          // Unresolved related slot — no pick yet, should be skipped.
          buildItem({ id: 'stop-2', blockType: 'itinerary-attractions', item: null }),
        ],
      },
    ],
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
  return [
    { id: 1, locationKey: 'peru|lima', city: 'Lima', country: 'Peru', level: 'city' },
  ]
}

function buildRelatedByBlockType(): Record<ItineraryBlockType, RelatedItemOption[]> {
  return {
    'itinerary-dining': [
      { id: 202, title: 'Mérito', location: 'Barranco, Lima', gallery: [], instagramGallery: [] },
    ],
    'itinerary-accommodations': [
      { id: 10, title: 'Grand Hotel', location: 'Barranco, Lima', gallery: [], instagramGallery: [] },
    ],
    'itinerary-where-staying': [
      { id: 10, title: 'Grand Hotel', location: 'Barranco, Lima', gallery: [], instagramGallery: [] },
    ],
    'itinerary-attractions': [],
    'itinerary-nightlife': [],
    'itinerary-key-location': [],
    'itinerary-tour-agency': [],
  }
}

describe('intro composer service', () => {
  it('resolves ordered stops with day labels, categories, and selection reasons', () => {
    const stops = getItineraryIntroComposableStops(buildDraft(), buildRelatedByBlockType())

    expect(stops).toEqual([
      {
        title: 'Grand Hotel',
        category: "Where You're Staying",
        dayLabel: 'Day 1',
        selectionReason: 'most comfortable, central',
      },
      {
        title: 'Mérito',
        category: 'Dining',
        dayLabel: 'Day 1',
        selectionReason: 'tasting-menu fine dining',
      },
    ])
  })

  it('omits selectionReason when absent and skips unresolved stops', () => {
    const draft = buildDraft({
      planOverview: '',
      days: [
        {
          id: 'day_1',
          whereStaying: [],
          items: [
            buildItem({ id: 'stop-1', blockType: 'itinerary-dining', item: 202 }),
            buildItem({ id: 'stop-2', blockType: 'itinerary-attractions', item: null }),
          ],
        },
      ],
    })

    const stops = getItineraryIntroComposableStops(draft, buildRelatedByBlockType())
    expect(stops).toEqual([
      { title: 'Mérito', category: 'Dining', dayLabel: 'Day 1', selectionReason: undefined },
    ])
  })

  it('gates composing on title and at least one resolved stop', () => {
    const related = buildRelatedByBlockType()
    expect(getItineraryIntroComposeDisabledReason(buildDraft(), related)).toBeUndefined()

    expect(getItineraryIntroComposeDisabledReason(buildDraft({ title: '   ' }), related))
      .toBe('Add a title before writing the intro')

    const emptyStops = buildDraft({
      days: [{ id: 'day_1', whereStaying: [], items: [] }],
    })
    expect(getItineraryIntroComposeDisabledReason(emptyStops, related))
      .toBe('Add at least one stop before writing the intro')
  })

  it('builds the compose-intro request from plan signal', () => {
    const request = buildItineraryComposeIntroRequest({
      draft: buildDraft(),
      relatedByBlockType: buildRelatedByBlockType(),
      locations: buildLocations(),
      modelName: 'claude-opus-4-8',
    })

    expect(request.articleTitle).toBe('One Perfect Day in Lima')
    expect(request.locationLabel).toBe('Lima, Peru')
    expect(request.listTone).toBe('elevated')
    expect(request.planOverview).toBe('A single luxurious foodie day anchored in Barranco.')
    expect(request.dayCount).toBe(1)
    expect(request.stops).toHaveLength(2)
  })

  it('drops an empty plan overview to undefined', () => {
    const request = buildItineraryComposeIntroRequest({
      draft: buildDraft({ planOverview: '   ' }),
      relatedByBlockType: buildRelatedByBlockType(),
      locations: buildLocations(),
      modelName: 'claude-opus-4-8',
    })
    expect(request.planOverview).toBeUndefined()
  })

  it('applies the composed intro and clears the cached lexical json', () => {
    const next = applyItineraryComposedIntro(
      buildDraft({ header: { introMarkdown: 'old', introJsonText: 'stale', featuredImage: null } }),
      'A polished new opener.',
    )
    expect(next.header.introMarkdown).toBe('A polished new opener.')
    expect(next.header.introJsonText).toBe('')
  })
})
