import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyDraft } from '../../storage'
import type { ItineraryBlockType, ListicleItineraryDraft, RelatedItemOption } from '../../types'
import { useItinerarySubmit } from './useItinerarySubmit'

const { createItineraryMock, markdownToLexicalMock } = vi.hoisted(() => ({
  createItineraryMock: vi.fn(),
  markdownToLexicalMock: vi.fn(async (markdown: string) => ({
    id: 'reused-payload-lexical-id',
    root: {
      type: 'root',
      children: [
        {
          id: 'lexical-node-dup',
          type: 'paragraph',
          children: [{ type: 'text', text: markdown }],
        },
      ],
    },
  })),
}))

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api')
  return {
    ...actual,
    createItinerary: createItineraryMock,
    updateItinerary: vi.fn(),
    markdownToLexical: markdownToLexicalMock,
  }
})

vi.mock('../../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage')>()
  return {
    ...actual,
    saveDraft: vi.fn(),
  }
})

const relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]> = {
  'itinerary-dining': [],
  'itinerary-accommodations': [],
  'itinerary-where-staying': [],
  'itinerary-attractions': [],
  'itinerary-nightlife': [],
  'itinerary-key-location': [],
  'itinerary-tour-agency': [],
}

function buildDraft(): ListicleItineraryDraft {
  const draft = createEmptyDraft()
  draft.title = 'Cusco Tour Plan'
  draft.payloadSlug = 'cusco-tour-plan'
  draft.location = 'peru|cusco'
  draft.locationRef = 1
  draft.step1_complete = true
  draft.step2_complete = true
  draft.step3_complete = true
  draft.header.introMarkdown = 'Intro copy'
  draft.days = [{
    ...draft.days[0],
    items: [{
      id: 'tour-stop-1',
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
      keyLocations: [{
        id: 'tour-stop-1_key_location_0',
        source: 'existing',
        relatedCollection: 'attractions',
        relatedItem: 202,
        title: '',
        latitude: '',
        longitude: '',
      }],
      image: null,
      instagramPost: null,
      blurbMarkdown: 'Manual stop blurb',
      blurbJsonText: '',
    }],
  }]
  return draft
}

describe('useItinerarySubmit', () => {
  it('submits normalized manual tour-agency payload fields', async () => {
    createItineraryMock.mockResolvedValue({
      id: 99,
      ...buildDraft(),
      header: {
        intro: { root: { type: 'root' } },
        featuredImage: null,
      },
      itineraryDays: [{ whereStaying: [], items: [] }],
      dayCount: 1,
      items: [],
      updatedAt: '2026-04-07T12:00:00.000Z',
      createdAt: '2026-04-07T12:00:00.000Z',
    })

    const onError = vi.fn()
    const setResult = vi.fn()

    const { result } = renderHook(() => {
      const [draft, setDraft] = useState<ListicleItineraryDraft | null>(buildDraft())

      return useItinerarySubmit({
        token: 'test-token',
        draft,
        setDraft,
        selectedLocationRefId: 1,
        relatedByBlockType,
        mediaAssets: [],
        instagramPosts: [],
        setSearchParams: vi.fn() as never,
        onError,
        setResult,
      })
    })

    await act(async () => {
      await result.current.submit('draft')
    })

    expect(createItineraryMock).toHaveBeenCalledTimes(1)
    const submitBody = createItineraryMock.mock.calls[0]?.[0] as Record<string, unknown>
    const itineraryDays = submitBody.itineraryDays as Array<{ items: Array<Record<string, unknown>> }>
    const submitItems = itineraryDays[0]?.items ?? []
    const firstItem = submitItems[0] || {}
    const header = submitBody.header as { intro: Record<string, unknown> }

    expect(header.intro).not.toHaveProperty('id')
    const introRoot = (header.intro as { root?: { children?: Array<Record<string, unknown>> } }).root
    expect(introRoot?.children?.[0]).not.toHaveProperty('id')
    expect(firstItem.blurb).toBeDefined()
    expect(firstItem.blurb as Record<string, unknown>).not.toHaveProperty('id')

    expect(submitBody).not.toHaveProperty('itineraryStartHour')
    expect(firstItem).not.toHaveProperty('timeHour')
    expect(firstItem).not.toHaveProperty('durationHours')
    expect(firstItem).toMatchObject({
      price: '$$$',
      tourDuration: 8,
      startingPoint: {
        label: 'Plaza de Armas',
        latitude: -13.516,
        longitude: -71.978,
      },
    })
    const keyLocs = firstItem.keyLocations as Array<Record<string, unknown>>
    expect(keyLocs[0]).not.toHaveProperty('id')
    expect(keyLocs[0]).toMatchObject({
      source: 'existing',
      relatedItem: { relationTo: 'attractions', value: 202 },
    })
    expect(onError).not.toHaveBeenCalledWith(expect.stringMatching(/\S/))
  })
})
