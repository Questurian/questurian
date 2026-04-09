import { describe, expect, it } from 'vitest'
import {
  applyItineraryGeneratedContent,
  buildItineraryGenerateListicleContentRequest,
  getItineraryAutoWriteTargetIds,
  getItineraryIntroTargetId,
} from './ai-autowrite.service'
import type {
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'

function buildDraft(): ListicleItineraryDraft {
  return {
    draftId: 'draft-1',
    editorModelName: 'gemini-2.5-flash',
    title: 'One Perfect Day in Lima',
    location: 'peru|lima',
    locationRef: 1,
    sharedNeighborhoods: [2],
    dayAudience: 'weekend',
    itineraryStartHour: 9,
    itineraryStartMinute: '00',
    itineraryStartPeriod: 'AM',
    itineraryEndHour: 10,
    itineraryEndMinute: '30',
    itineraryEndPeriod: 'PM',
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
    items: [
      {
        id: 'stop-1',
        blockType: 'itinerary-key-location',
        item: 201,
        mediaMode: 'photos',
        selectedPhotos: [8],
        selectedInstagramPost: null,
        timeHour: 9,
        timeMinute: '00',
        timePeriod: 'AM',
        durationHours: 1,
        durationMinutes: '30',
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
        mediaMode: 'instagram',
        selectedPhotos: [],
        selectedInstagramPost: 19,
        timeHour: 1,
        timeMinute: '15',
        timePeriod: 'PM',
        durationHours: 1,
        durationMinutes: '0',
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
  it('builds itinerary requests with intro and stop research context', () => {
    const draft = buildDraft()
    const introTargetId = getItineraryIntroTargetId(draft)
    const request = buildItineraryGenerateListicleContentRequest({
      draft,
      relatedByBlockType: buildRelatedByBlockType(),
      locations: buildLocations(),
      targetIds: [introTargetId, 'stop-1_blurb'],
      modelName: 'gemini-2.5-flash',
    })

    expect(request.articleType).toBe('listicle-itinerary')
    expect(request.locationLabel).toBe('Lima, Peru (focus neighborhoods: Barranco)')
    expect(request.articleContext).toContain('### Stop 2: Dining at 1:15 PM (1h) (#202)')
    expect(request.targets).toEqual([
      expect.objectContaining({
        targetId: introTargetId,
        fieldType: 'intro',
      }),
      expect.objectContaining({
        targetId: 'stop-1_blurb',
        fieldType: 'blurb',
        category: 'key_location',
        displayName: 'Puente de los Suspiros',
        researchSubject: 'Puente de los Suspiros',
        locationLabel: 'Barranco, Lima',
      }),
    ])
  })

  it('returns only empty intro and stop blurbs for bulk auto-write', () => {
    const draft = buildDraft()

    expect(getItineraryAutoWriteTargetIds(draft, buildRelatedByBlockType() as Record<
      ListicleItineraryDraft['items'][number]['blockType'],
      RelatedItemOption[]
    >)).toEqual([
      getItineraryIntroTargetId(draft),
      'stop-1_blurb',
    ])
  })

  it('applies only generated itinerary fields back onto the draft', () => {
    const draft = buildDraft()
    const nextDraft = applyItineraryGeneratedContent(draft, {
      results: {
        [getItineraryIntroTargetId(draft)]: {
          target_id: getItineraryIntroTargetId(draft),
          status: 'generated',
          markdown: 'Weekend intro',
          model_used: 'gemini-2.5-flash',
          source_urls: ['https://example.com'],
          validation_errors: [],
        },
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

    expect(nextDraft.header.introMarkdown).toBe('Weekend intro')
    expect(nextDraft.items[0]?.blurbMarkdown).toBe('Bridge blurb')
    expect(nextDraft.items[1]?.blurbMarkdown).toBe('Existing lunch copy')
  })

  it('formats manual tour-agency context with tiered price, hour duration, and coordinate starting point', () => {
    const draft = buildDraft()
    draft.items = [{
      id: 'tour-stop',
      blockType: 'itinerary-tour-agency',
      item: null,
      mediaMode: 'photos',
      selectedPhotos: [],
      selectedInstagramPost: null,
      timeHour: 8,
      timeMinute: '00',
      timePeriod: 'AM',
      durationHours: 1,
      durationMinutes: '0',
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
})
