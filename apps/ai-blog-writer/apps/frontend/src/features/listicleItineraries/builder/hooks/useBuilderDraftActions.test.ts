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
    level: 'city',
  },
  {
    id: 3,
    locationKey: 'peru|lima|barranco',
    country: 'peru',
    city: 'lima',
    neighborhood: 'barranco',
    parentKey: 'peru|lima',
    level: 'neighborhood',
  },
]

function buildDraft(): ListicleItineraryDraft {
  const draft = createEmptyDraft()
  draft.title = 'A day in Lima'
  draft.location = 'peru|lima'
  draft.locationRef = 2
  draft.dayAudience = 'anyday'
  draft.tripIntent = ['explore']
  draft.step1_complete = true
  draft.step2_complete = true
  draft.step3_complete = true
  draft.header.introMarkdown = 'Keep this itinerary intro'
  draft.seoSection.metaDescription = 'Keep this itinerary SEO description'
  draft.items = [
    {
      id: 'stop-1',
      blockType: 'itinerary-dining',
      item: 101,
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
        longitude: '',
      },
      keyLocations: [],
      image: null,
      instagramPost: null,
      blurbMarkdown: 'Existing stop copy',
      blurbJsonText: '',
    },
  ]
  return draft
}

function useHarness(initialDraft: ListicleItineraryDraft) {
  const [draft, setDraft] = useState<ListicleItineraryDraft | null>(initialDraft)
  const actions = useBuilderDraftActions({
    draft,
    setDraft,
    locations,
    relatedByBlockType: {
      'itinerary-dining': [],
      'itinerary-accommodations': [],
      'itinerary-attractions': [],
      'itinerary-nightlife': [],
      'itinerary-key-location': [],
      'itinerary-tour-agency': [],
    },
    navigate: vi.fn(),
    setSearchParams: vi.fn() as never,
    onError: vi.fn(),
    setResult: vi.fn(),
  })

  return {
    draft,
    ...actions,
  }
}

describe('listicleItineraries useBuilderDraftActions', () => {
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
    expect(result.current.draft?.header.introMarkdown).toBe('Keep this itinerary intro')
    expect(result.current.draft?.seoSection.metaDescription).toBe('Keep this itinerary SEO description')
    expect(result.current.draft?.items).toEqual([])
  })
})
