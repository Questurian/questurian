import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { createEmptyDraft } from '../../storage'
import type { ListicleItineraryDraft, LocationOption } from '../../types'
import { useBuilderDraftActions } from './useBuilderDraftActions'

const locations: LocationOption[] = [
  {
    id: 2,
    locationKey: 'peru|lima',
    country: 'peru',
    city: 'lima',
    level: 'city'
  },
  {
    id: 3,
    locationKey: 'peru|lima|barranco',
    country: 'peru',
    city: 'lima',
    neighborhood: 'barranco',
    parentKey: 'peru|lima',
    level: 'neighborhood'
  }
]

function buildDraft(): ListicleItineraryDraft {
  const draft = createEmptyDraft()
  draft.title = 'A day in Lima'
  draft.payloadSlug = 'a-day-in-lima'
  draft.location = 'peru|lima'
  draft.locationRef = 2
  draft.step1_complete = true
  draft.step2_complete = true
  draft.step3_complete = true
  draft.header.introMarkdown = 'Keep this itinerary intro'
  draft.seoSection.metaDescription = 'Keep this itinerary SEO description'
  draft.days = [
    {
      ...draft.days[0],
      items: [
        {
          id: 'stop-1',
          blockType: 'itinerary-dining',
          item: 101,
          tours: [],
          mediaMode: 'photos',
          selectedPhotos: [9001],
          selectedInstagramPost: null,
          title: '',
          operator: '',
          price: '',
          url: '',
          tourDuration: 1,
          startingPoint: {
            label: '',
            latitude: '',
            longitude: ''
          },
          keyLocations: [],
          image: null,
          instagramPost: null,
          blurbMarkdown: 'Existing stop copy',
          blurbJsonText: '',
          selectionReason: 'original autobuild reason'
        }
      ]
    }
  ]
  return draft
}

function useHarness(initialDraft: ListicleItineraryDraft) {
  const [draft, setDraft] = useState<ListicleItineraryDraft | null>(
    initialDraft
  )
  const actions = useBuilderDraftActions({
    draft,
    setDraft,
    locations,
    relatedByBlockType: {
      'itinerary-dining': [],
      'itinerary-accommodations': [],
      'itinerary-where-staying': [],
      'itinerary-attractions': [],
      'itinerary-nightlife': [],
      'itinerary-key-location': [],
      'itinerary-tour-agency': []
    },
    navigate: vi.fn(),
    setSearchParams: vi.fn() as never,
    onError: vi.fn(),
    setResult: vi.fn()
  })

  return {
    draft,
    ...actions
  }
}

describe('listicleItineraries useBuilderDraftActions', () => {
  it('allows Step 2 to pass empty without invalidating completed Step 3', () => {
    const draft = buildDraft()
    draft.step2_complete = false
    draft.header.introMarkdown = ''
    const { result } = renderHook(() => useHarness(draft))

    act(() => {
      result.current.handleContinueStep2()
    })

    expect(result.current.draft?.step2_complete).toBe(true)
    expect(result.current.draft?.step3_complete).toBe(true)
  })

  it('clears stops but preserves header and SEO when shared neighborhoods change', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { result } = renderHook(() => useHarness(buildDraft()))

    act(() => {
      result.current.handleUpdateSetup()
    })

    act(() => {
      result.current.updateDraft({ sharedNeighborhoods: [3] })
    })

    act(() => {
      result.current.handleSaveSetup()
    })

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(result.current.draft?.sharedNeighborhoods).toEqual([3])
    expect(result.current.draft?.step2_complete).toBe(false)
    expect(result.current.draft?.step3_complete).toBe(false)
    expect(result.current.draft?.header.introMarkdown).toBe(
      'Keep this itinerary intro'
    )
    expect(result.current.draft?.seoSection.metaDescription).toBe(
      'Keep this itinerary SEO description'
    )
    expect(result.current.draft?.days[0]?.items).toEqual([])
  })

  it('clears the Selection reason and blurb when a stop identity is swapped (ADR 0020)', () => {
    const { result } = renderHook(() => useHarness(buildDraft()))

    act(() => {
      result.current.updateItem('stop-1', (current) => ({
        ...current,
        item: 202
      }))
    })

    const item = result.current.draft?.days[0]?.items[0]
    expect(item?.item).toBe(202)
    expect(item?.selectionReason).toBe('')
    expect(item?.blurbMarkdown).toBe('')
  })

  it('keeps the Selection reason and blurb when a non-identity field changes', () => {
    const { result } = renderHook(() => useHarness(buildDraft()))

    act(() => {
      result.current.updateItem('stop-1', (current) => ({
        ...current,
        price: '$$$'
      }))
    })

    const item = result.current.draft?.days[0]?.items[0]
    expect(item?.price).toBe('$$$')
    expect(item?.selectionReason).toBe('original autobuild reason')
    expect(item?.blurbMarkdown).toBe('Existing stop copy')
  })

  it('appends a new stop when addItem is called without an index', () => {
    const { result } = renderHook(() => useHarness(buildDraft()))

    act(() => {
      result.current.addItem(0)
    })

    const items = result.current.draft?.days[0]?.items ?? []
    expect(items).toHaveLength(2)
    expect(items[0]?.id).toBe('stop-1')
    expect(items[1]?.item).toBeNull()
  })

  it('inserts a new stop at the given index', () => {
    const { result } = renderHook(() => useHarness(buildDraft()))

    act(() => {
      result.current.addItem(0, 0)
    })

    const items = result.current.draft?.days[0]?.items ?? []
    expect(items).toHaveLength(2)
    // The blank stop lands first; the original stop shifts down.
    expect(items[0]?.item).toBeNull()
    expect(items[1]?.id).toBe('stop-1')
  })

  it('clamps an out-of-range insert index instead of dropping the stop', () => {
    const { result } = renderHook(() => useHarness(buildDraft()))

    act(() => {
      result.current.addItem(0, 99)
    })

    const items = result.current.draft?.days[0]?.items ?? []
    expect(items).toHaveLength(2)
    expect(items[0]?.id).toBe('stop-1')
    expect(items[1]?.item).toBeNull()
  })

  it('preserves the action contract for lodging, ordering, and removal', () => {
    const { result } = renderHook(() => useHarness(buildDraft()))

    act(() => {
      result.current.addWhereStayingItem(0)
      result.current.addItem(0)
    })

    const newStopId = result.current.draft?.days[0]?.items[1]?.id
    const lodgingId = result.current.draft?.days[0]?.whereStaying[0]?.id
    expect(newStopId).toMatch(/^item_/)
    expect(lodgingId).toMatch(/^item_/)

    act(() => {
      result.current.moveItem(newStopId!, 'up')
      result.current.removeItem(lodgingId!)
    })

    expect(result.current.draft?.days[0]?.items.map((item) => item.id)).toEqual(
      [newStopId, 'stop-1']
    )
    expect(result.current.draft?.days[0]?.whereStaying).toEqual([])
  })
})
