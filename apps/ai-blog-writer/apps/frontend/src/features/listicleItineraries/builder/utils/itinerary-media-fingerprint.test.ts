import { describe, expect, it } from 'vitest'
import { createEmptyDraft } from '../../storage'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  RelatedItemOption,
} from '../../types'
import { buildItineraryMediaFingerprint, hasUpstreamMediaDrift } from './itinerary-media-fingerprint'

function makeStop(overrides: Partial<ItineraryItemBlock>): ItineraryItemBlock {
  return {
    id: `item_${Math.random().toString(36).slice(2, 8)}`,
    blockType: 'itinerary-attractions',
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

function makeDraftWithStops(stops: ItineraryItemBlock[]): ListicleItineraryDraft {
  const draft = createEmptyDraft()
  draft.payloadId = 15
  draft.days[0].items = stops
  return draft
}

function makePools(
  entries: Partial<Record<ItineraryBlockType, RelatedItemOption[]>>,
): Record<ItineraryBlockType, RelatedItemOption[]> {
  return entries as Record<ItineraryBlockType, RelatedItemOption[]>
}

const attraction = (id: number, galleryImageIds: number[]): RelatedItemOption => ({
  id,
  title: `Attraction ${id}`,
  gallery: galleryImageIds.map((imageId) => ({ image: imageId })),
})

describe('buildItineraryMediaFingerprint', () => {
  it('is stable across pool ordering and unreferenced items', () => {
    const draft = makeDraftWithStops([makeStop({ item: 7 })])

    const poolsA = makePools({
      'itinerary-attractions': [attraction(7, [3, 1, 2]), attraction(8, [9])],
    })
    const poolsB = makePools({
      'itinerary-attractions': [attraction(7, [1, 2, 3])],
    })

    expect(buildItineraryMediaFingerprint(draft, poolsA))
      .toBe(buildItineraryMediaFingerprint(draft, poolsB))
  })

  it('changes when a referenced gallery gains an uploaded image', () => {
    const draft = makeDraftWithStops([makeStop({ item: 7 })])

    const before = makePools({ 'itinerary-attractions': [attraction(7, [1, 2])] })
    const after = makePools({ 'itinerary-attractions': [attraction(7, [1, 2, 99])] })

    expect(buildItineraryMediaFingerprint(draft, after))
      .not.toBe(buildItineraryMediaFingerprint(draft, before))
  })

  it('ignores gallery changes on items the draft does not reference', () => {
    const draft = makeDraftWithStops([makeStop({ item: 7 })])

    const before = makePools({
      'itinerary-attractions': [attraction(7, [1]), attraction(8, [2])],
    })
    const after = makePools({
      'itinerary-attractions': [attraction(7, [1]), attraction(8, [2, 99])],
    })

    expect(buildItineraryMediaFingerprint(draft, after))
      .toBe(buildItineraryMediaFingerprint(draft, before))
  })

  it('ignores manual blocks', () => {
    const manualOnly = makeDraftWithStops([makeStop({ blockType: 'itinerary-tour-agency', item: 5 })])
    const empty = makeDraftWithStops([])
    const pools = makePools({})

    expect(buildItineraryMediaFingerprint(manualOnly, pools))
      .toBe(buildItineraryMediaFingerprint(empty, pools))
  })
})

describe('hasUpstreamMediaDrift', () => {
  const stampedDraft = (pools: Record<ItineraryBlockType, RelatedItemOption[]>) => {
    const draft = makeDraftWithStops([makeStop({ item: 7 })])
    draft.lastPayloadSyncMediaFingerprint = buildItineraryMediaFingerprint(draft, pools)
    return draft
  }

  it('flags drift when a referenced gallery grew since the stamp', () => {
    const draft = stampedDraft(makePools({ 'itinerary-attractions': [attraction(7, [1, 2])] }))
    const grown = makePools({ 'itinerary-attractions': [attraction(7, [1, 2, 99])] })

    expect(hasUpstreamMediaDrift(draft, grown)).toBe(true)
  })

  it('reports no drift when pools match the stamp', () => {
    const pools = makePools({ 'itinerary-attractions': [attraction(7, [1, 2])] })

    expect(hasUpstreamMediaDrift(stampedDraft(pools), pools)).toBe(false)
  })

  it('reports no drift without a stamped fingerprint (legacy drafts)', () => {
    const draft = makeDraftWithStops([makeStop({ item: 7 })])
    const pools = makePools({ 'itinerary-attractions': [attraction(7, [1, 2, 99])] })

    expect(hasUpstreamMediaDrift(draft, pools)).toBe(false)
  })

  it('reports no drift when no referenced item resolves (pools unavailable)', () => {
    const draft = stampedDraft(makePools({ 'itinerary-attractions': [attraction(7, [1, 2])] }))

    expect(hasUpstreamMediaDrift(draft, makePools({}))).toBe(false)
  })

  it('reports no drift for drafts without a Payload identity', () => {
    const pools = makePools({ 'itinerary-attractions': [attraction(7, [1, 2])] })
    const draft = stampedDraft(pools)
    draft.payloadId = undefined

    expect(hasUpstreamMediaDrift(draft, pools)).toBe(false)
  })
})
