import { afterEach, beforeEach, vi } from 'vitest'
import { createEmptyDraft, listDrafts, saveDraft } from './storage'

const CURRENT_STORAGE_KEY = 'listicle_itineraries_staged_v7_multiday'
const LEGACY_STORAGE_KEY = 'listicle_itineraries_staged_v3_inline_seo'

/** In-memory Storage — Node's experimental localStorage can omit or break Web Storage methods. */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  const keyAt = (index: number) => Array.from(store.keys())[index] ?? null

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
    removeItem(key: string) {
      store.delete(key)
    },
    key(index: number) {
      return keyAt(index)
    },
  } as Storage
}

describe('listicleItineraries storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('round-trips the local changes marker for Payload-linked drafts', () => {
    const draft = createEmptyDraft()
    draft.payloadId = 123
    draft.hasLocalChanges = true

    saveDraft(draft)

    expect(listDrafts()[0]?.hasLocalChanges).toBe(true)
  })

  it('round-trips manual tour-agency instagram and key-location rows', () => {
    const draft = createEmptyDraft()
    draft.days = [{
      ...draft.days[0],
      items: [{
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
    }],
  }]

    saveDraft(draft)

    const restored = listDrafts()[0]
    expect(restored?.days[0]?.items[0]?.instagramPost).toBe(42)
    expect(restored?.days[0]?.items[0]?.tourDuration).toBe(4)
    expect(restored?.days[0]?.items[0]?.startingPoint).toEqual({
      label: 'Cusco Plaza',
      latitude: '-13.516',
      longitude: '-71.978',
    })
    expect(restored?.days[0]?.items[0]?.keyLocations).toEqual([
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
    // Legacy flat `items` / `whereStaying` must migrate when `days` is absent; spreading
    // `createEmptyDraft()` alone would leave `days` populated and skip the legacy path.
    const legacyDraft = {
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
    }
    delete (legacyDraft as Record<string, unknown>).days
    delete (legacyDraft as Record<string, unknown>).dayCount

    localStorage.setItem(CURRENT_STORAGE_KEY, JSON.stringify([legacyDraft]))

    const restored = listDrafts()[0]
    expect(restored?.title).toBe('')
    expect(restored?.days[0]?.items[0]?.title).toBe('Legacy Sacred Valley Circuit')
    expect('itineraryStartHour' in (restored as Record<string, unknown>)).toBe(false)
    expect('timeHour' in ((restored?.days[0]?.items[0] ?? {}) as Record<string, unknown>)).toBe(false)
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
