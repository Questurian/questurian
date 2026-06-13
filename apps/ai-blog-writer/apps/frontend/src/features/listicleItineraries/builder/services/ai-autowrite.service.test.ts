import { describe, expect, it } from 'vitest'
import {
  applyItineraryGeneratedContent,
  buildItineraryGenerateListicleContentRequest,
  getItineraryAutoWriteTargetIds,
  getItineraryStopAngleDisabledReason,
} from './ai-autowrite.service'
import type {
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'

function buildDraft(): ListicleItineraryDraft {
  return {
    draftId: 'draft-1',
    editorModelName: 'gemini-2.5-flash',
    listTone: 'elevated',
    title: 'One Perfect Day in Lima',
    location: 'peru|lima',
    locationRef: 1,
    sharedNeighborhoods: [2],
    step1_complete: true,
    in_update_mode: false,
    step2_complete: true,
    step2_in_update_mode: false,
    step3_complete: false,
    step3_in_update_mode: false,
    header: {
      introMarkdown: '',
      featuredImage: null,
    },
    dayCount: 1,
    days: [
      {
        id: 'day_1',
        whereStaying: [],
        items: [
          {
            id: 'stop-1',
            blockType: 'itinerary-key-location',
            item: 201,
            tours: [],
            mediaMode: 'photos',
            selectedPhotos: [8],
            selectedInstagramPost: null,
            title: '',
            operator: '',
            price: '',
            url: '',
            tourDuration: 1,
            startingPoint: {
              label: '',
              latitude: '',
              longitude: '',
            },
            keyLocations: [],
            image: null,
            instagramPost: null,
            blurbMarkdown: '',
          },
          {
            id: 'stop-2',
            blockType: 'itinerary-dining',
            item: 202,
            tours: [],
            mediaMode: 'instagram',
            selectedPhotos: [],
            selectedInstagramPost: 19,
            title: '',
            operator: '',
            price: '',
            url: '',
            tourDuration: 1,
            startingPoint: {
              label: '',
              latitude: '',
              longitude: '',
            },
            keyLocations: [],
            image: null,
            instagramPost: null,
            blurbMarkdown: 'Existing lunch copy',
          },
        ],
      },
    ],
    seoSection: {
      seoTitle: '',
      metaDescription: '',
      openGraph: {
        title: '',
        description: '',
        imageUrl: '',
        url: '',
      },
      twitterCard: {
        card: 'summary_large_image',
        title: '',
        description: '',
        imageUrl: '',
      },
      structuredData: '',
      robots: {
        index: 'index',
        follow: 'follow',
      },
    },
    status: 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: '2026-03-30T12:00:00.000Z',
  }
}

function buildLocations(): LocationOption[] {
  return [
    {
      id: 1,
      locationKey: 'peru|lima',
      city: 'Lima',
      country: 'Peru',
      level: 'city',
    },
    {
      id: 2,
      locationKey: 'peru|lima|barranco',
      neighborhood: 'Barranco',
      city: 'Lima',
      country: 'Peru',
      level: 'neighborhood',
    },
  ]
}

function buildRelatedByBlockType(): Record<string, RelatedItemOption[]> {
  return {
    'itinerary-dining': [
      {
        id: 202,
        title: 'Mérito',
        location: 'Barranco, Lima',
        gallery: [],
        instagramGallery: [],
      },
    ],
    'itinerary-accommodations': [],
    'itinerary-where-staying': [],
    'itinerary-attractions': [],
    'itinerary-nightlife': [],
    'itinerary-key-location': [
      {
        id: 201,
        title: 'Puente de los Suspiros',
        location: 'Barranco, Lima',
        gallery: [],
        instagramGallery: [],
      },
    ],
    'itinerary-tour-agency': [],
  }
}

describe('listicleItineraries ai autowrite service', () => {
  it('builds itinerary requests with stop research context (intro excluded)', () => {
    const draft = buildDraft()
    const request = buildItineraryGenerateListicleContentRequest({
      draft,
      relatedByBlockType: buildRelatedByBlockType(),
      locations: buildLocations(),
      targetIds: ['stop-1_blurb'],
      modelName: 'gemini-2.5-flash',
    })

    expect(request.articleType).toBe('listicle-itinerary')
    expect(request.locationLabel).toBe('Lima, Peru (focus neighborhoods: Barranco)')
    expect(request.articleContext).toContain('### Stop 2: Dining (#202)')
    // Intro is composed on its own path (ADR 0018) — never a blurb-batch target.
    expect(request.targets.some((target) => target.fieldType === 'intro')).toBe(false)
    expect(request.targets).toEqual([
      expect.objectContaining({
        targetId: 'stop-1_blurb',
        fieldType: 'blurb',
        category: 'key_location',
        displayName: 'Puente de los Suspiros',
        researchSubject: 'Puente de los Suspiros',
        locationLabel: 'Barranco, Lima',
        payloadDocId: '201',
        payloadCollection: 'key-locations',
      }),
    ])
  })

  it('returns only empty stop blurbs for bulk auto-write (intro excluded)', () => {
    const draft = buildDraft()

    expect(getItineraryAutoWriteTargetIds(draft, buildRelatedByBlockType() as Record<
      ItineraryItemBlock['blockType'],
      RelatedItemOption[]
    >)).toEqual([
      'stop-1_blurb',
    ])
  })

  it('applies only generated stop blurbs back onto the draft, never the intro', () => {
    const draft = buildDraft()
    const nextDraft = applyItineraryGeneratedContent(draft, {
      results: {
        'stop-1_blurb': {
          target_id: 'stop-1_blurb',
          status: 'generated',
          markdown: 'Bridge blurb',
          model_used: 'gemini-2.5-flash',
          source_urls: [],
          validation_errors: [],
        },
        'stop-2_blurb': {
          target_id: 'stop-2_blurb',
          status: 'skipped',
          markdown: 'Existing lunch copy',
          model_used: 'gemini-2.5-flash',
          source_urls: [],
          validation_errors: [],
        },
      },
    })

    // Intro is untouched by this path even if a stale intro result appears.
    expect(nextDraft.header.introMarkdown).toBe('')
    expect(nextDraft.days[0]?.items[0]?.blurbMarkdown).toBe('Bridge blurb')
    expect(nextDraft.days[0]?.items[1]?.blurbMarkdown).toBe('Existing lunch copy')
  })

  it('formats manual tour-agency context with tiered price, hour duration, and coordinate starting point', () => {
    const draft = buildDraft()
    draft.days = [{
      ...draft.days[0],
      items: [{
        id: 'tour-stop',
        blockType: 'itinerary-tour-agency',
        item: null,
        tours: [],
        mediaMode: 'photos',
        selectedPhotos: [],
        selectedInstagramPost: null,
        title: 'Sacred Valley Day Tour',
        operator: 'Andes Routes',
        price: '$$$',
        url: 'https://example.com/tours/sacred-valley',
        tourDuration: 8,
        startingPoint: {
          label: 'Plaza de Armas',
          latitude: '-13.516',
          longitude: '-71.978',
        },
        keyLocations: [],
        image: null,
        instagramPost: null,
        blurbMarkdown: '',
        blurbJsonText: '',
      }],
    }]

    const request = buildItineraryGenerateListicleContentRequest({
      draft,
      relatedByBlockType: buildRelatedByBlockType(),
      locations: buildLocations(),
      targetIds: ['tour-stop_blurb'],
      modelName: 'gemini-2.5-flash',
    })

    expect(request.targets[0]?.supportingContext).toContain('Price: $$$')
    expect(request.targets[0]?.supportingContext).toContain('Tour duration: 8 hours')
    expect(request.targets[0]?.supportingContext).toContain('Starting point: Plaza de Armas (-13.516, -71.978)')
  })

  it('plumbs the resolved per-stop angle and the list tone into the request', () => {
    const draft = buildDraft()
    draft.days[0].items[1] = {
      ...draft.days[0].items[1],
      blurbMarkdown: '',
      angle: 'signature-dish',
    }

    const request = buildItineraryGenerateListicleContentRequest({
      draft,
      relatedByBlockType: buildRelatedByBlockType(),
      locations: buildLocations(),
      targetIds: ['stop-2_blurb'],
      modelName: 'gemini-2.5-flash',
    })

    expect(request.listTone).toBe('elevated')
    expect(request.targets[0]).toEqual(expect.objectContaining({
      targetId: 'stop-2_blurb',
      category: 'dining',
      payloadDocId: '202',
      payloadCollection: 'dining',
      angle: 'signature-dish',
    }))
  })

  it('auto-resolves nightlife stops to best-for-night even with no angle selected', () => {
    const draft = buildDraft()
    draft.days[0].items = [{
      ...draft.days[0].items[1],
      id: 'night-1',
      blockType: 'itinerary-nightlife',
      item: 301,
      blurbMarkdown: '',
      angle: null,
    }]
    const related = buildRelatedByBlockType() as Record<
      ItineraryItemBlock['blockType'],
      RelatedItemOption[]
    >
    related['itinerary-nightlife'] = [
      { id: 301, title: 'Carnaval', location: 'Barranco, Lima', gallery: [], instagramGallery: [] },
    ]

    const request = buildItineraryGenerateListicleContentRequest({
      draft,
      relatedByBlockType: related,
      locations: buildLocations(),
      targetIds: ['night-1_blurb'],
      modelName: 'gemini-2.5-flash',
    })

    expect(request.targets[0]).toEqual(expect.objectContaining({
      targetId: 'night-1_blurb',
      category: 'nightlife',
      angle: 'best-for-night',
    }))
  })

  it('sends a null angle for pool-less key-location stops', () => {
    const draft = buildDraft()

    const request = buildItineraryGenerateListicleContentRequest({
      draft,
      relatedByBlockType: buildRelatedByBlockType(),
      locations: buildLocations(),
      targetIds: ['stop-1_blurb'],
      modelName: 'gemini-2.5-flash',
    })

    expect(request.targets[0]).toEqual(expect.objectContaining({
      targetId: 'stop-1_blurb',
      category: 'key_location',
      angle: null,
    }))
  })

  describe('angle gating', () => {
    const relatedCast = () => buildRelatedByBlockType() as Record<
      ItineraryItemBlock['blockType'],
      RelatedItemOption[]
    >

    it('excludes pooled-category stops without an angle and reports why', () => {
      const draft = buildDraft()
      const dining: ItineraryItemBlock = {
        ...draft.days[0].items[1],
        blurbMarkdown: '',
        angle: null,
      }
      draft.days[0].items[1] = dining

      expect(getItineraryStopAngleDisabledReason(dining)).toBe(
        'Select a blurb angle before generating',
      )
      // key-location stop (pool-less) stays eligible; the dining stop is skipped.
      expect(getItineraryAutoWriteTargetIds(draft, relatedCast())).toEqual([
        'stop-1_blurb',
      ])
    })

    it('includes the pooled stop once an angle is selected', () => {
      const draft = buildDraft()
      const dining: ItineraryItemBlock = {
        ...draft.days[0].items[1],
        blurbMarkdown: '',
        angle: 'signature-dish',
      }
      draft.days[0].items[1] = dining

      expect(getItineraryStopAngleDisabledReason(dining)).toBeUndefined()
      expect(getItineraryAutoWriteTargetIds(draft, relatedCast())).toContain('stop-2_blurb')
    })

    it('never blocks pool-less or single-angle nightlife stops', () => {
      const draft = buildDraft()
      // key-location (no pool)
      expect(getItineraryStopAngleDisabledReason(draft.days[0].items[0])).toBeUndefined()
      // nightlife with no angle still resolves to best-for-night
      const night: ItineraryItemBlock = {
        ...draft.days[0].items[1],
        blockType: 'itinerary-nightlife',
        angle: null,
      }
      expect(getItineraryStopAngleDisabledReason(night)).toBeUndefined()
    })
  })
})
