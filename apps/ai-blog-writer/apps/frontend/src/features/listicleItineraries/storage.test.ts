import { createEmptyDraft, listDrafts, saveDraft } from './storage'

const CURRENT_STORAGE_KEY = 'listicle_itineraries_staged_v6_tour_agency_normalized_fields'
const LEGACY_STORAGE_KEY = 'listicle_itineraries_staged_v3_inline_seo'

describe('listicleItineraries storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and normalizes shared neighborhoods under the v5 key', () => {
    const draft = createEmptyDraft()
    draft.sharedNeighborhoods = [7, 6, 7]

    saveDraft(draft)

    const raw = JSON.parse(localStorage.getItem(CURRENT_STORAGE_KEY) || '[]') as Array<Record<string, unknown>>
    expect(raw).toHaveLength(1)
    expect(raw[0]?.sharedNeighborhoods).toEqual([7, 6, 7])
    expect(listDrafts()[0]?.sharedNeighborhoods).toEqual([7, 6])
  })

  it('round-trips manual tour-agency instagram and key-location rows', () => {
    const draft = createEmptyDraft()
    draft.items = [{
      id: 'tour-stop-1',
      blockType: 'itinerary-tour-agency',
      item: null,
      mediaMode: 'photos',
      selectedPhotos: [],
      selectedInstagramPost: null,
      title: 'Sacred Valley Circuit',
      operator: 'Andes Routes',
      price: '$$',
      url: 'https://example.com/tours/sacred-valley',
      tourDuration: 4,
      startingPoint: {
        label: 'Cusco Plaza',
        latitude: '-13.516',
        longitude: '-71.978',
      },
      keyLocations: [
        {
          id: 'existing-stop',
          source: 'existing',
          relatedCollection: 'attractions',
          relatedItem: 202,
          title: '',
          latitude: '',
          longitude: '',
        },
        {
          id: 'manual-stop',
          source: 'manual',
          relatedCollection: null,
          relatedItem: null,
          title: 'Maras lookout',
          latitude: '-13.3283',
          longitude: '-72.1594',
        },
      ],
      image: 501,
      instagramPost: 42,
      blurbMarkdown: 'A curated half-day route through the Sacred Valley.',
      blurbJsonText: '',
    }]

    saveDraft(draft)

    const restored = listDrafts()[0]
    expect(restored?.items[0]?.instagramPost).toBe(42)
    expect(restored?.items[0]?.tourDuration).toBe(4)
    expect(restored?.items[0]?.startingPoint).toEqual({
      label: 'Cusco Plaza',
      latitude: '-13.516',
      longitude: '-71.978',
    })
    expect(restored?.items[0]?.keyLocations).toEqual([
      {
        id: 'existing-stop',
        source: 'existing',
        relatedCollection: 'attractions',
        relatedItem: 202,
        title: '',
        latitude: '',
        longitude: '',
      },
      {
        id: 'manual-stop',
        source: 'manual',
        relatedCollection: null,
        relatedItem: null,
        title: 'Maras lookout',
        latitude: '-13.3283',
        longitude: '-72.1594',
      },
    ])
  })

  it('drops legacy schedule fields while preserving current-key drafts', () => {
    localStorage.setItem(CURRENT_STORAGE_KEY, JSON.stringify([{
      ...createEmptyDraft(),
      draftId: 'legacy-current-draft',
      itineraryStartHour: 9,
      itineraryStartMinute: '00',
      itineraryStartPeriod: 'AM',
      itineraryEndHour: 6,
      itineraryEndMinute: '00',
      itineraryEndPeriod: 'PM',
      items: [{
        id: 'legacy-stop-1',
        blockType: 'itinerary-tour-agency',
        item: null,
        mediaMode: 'photos',
        selectedPhotos: [],
        selectedInstagramPost: null,
        timeHour: 10,
        timeMinute: '15',
        timePeriod: 'AM',
        durationHours: 2,
        durationMinutes: '30',
        title: 'Legacy Sacred Valley Circuit',
        operator: 'Andes Routes',
        price: '$$',
        url: 'https://example.com/tours/sacred-valley',
        tourDuration: 8,
        startingPoint: {
          label: 'Cusco Plaza',
          latitude: '-13.516',
          longitude: '-71.978',
        },
        keyLocations: [],
        image: null,
        instagramPost: null,
        blurbMarkdown: 'Legacy blurb',
        blurbJsonText: '',
      }],
    }]))

    const restored = listDrafts()[0]
    expect(restored?.title).toBe('')
    expect(restored?.items[0]?.title).toBe('Legacy Sacred Valley Circuit')
    expect('itineraryStartHour' in (restored as Record<string, unknown>)).toBe(false)
    expect('timeHour' in ((restored?.items[0] ?? {}) as Record<string, unknown>)).toBe(false)
  })

  it('ignores legacy staged drafts instead of migrating them', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify([{
      ...createEmptyDraft(),
      draftId: 'legacy-itinerary',
    }]))

    expect(listDrafts()).toEqual([])
    expect(localStorage.getItem(CURRENT_STORAGE_KEY)).toBeNull()
  })
})
