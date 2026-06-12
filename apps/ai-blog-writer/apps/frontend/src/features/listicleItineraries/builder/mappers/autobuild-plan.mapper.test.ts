import { describe, expect, it } from 'vitest'
import type { ListicleItineraryDraft } from '../../types'
import type { AutobuildResponse } from '../services/autobuild.api'
import { applyAutobuildPlanToDraft } from './autobuild-plan.mapper'

// Deterministic ids for assertions.
const ids = (kind: string, day: number, slot: number) => `${kind}-${day}-${slot}`

function baseDraft(): ListicleItineraryDraft {
  return {
    draftId: 'd1',
    editorModelName: 'claude-opus-4-7',
    listTone: 'elevated',
    generationBrief: 'luxury foodie day',
    title: 'Luxury Foodie Day',
    location: 'colombia|medellin',
    locationRef: null,
    sharedNeighborhoods: [],
    step1_complete: true,
    in_update_mode: false,
    step2_complete: false,
    step2_in_update_mode: false,
    step3_complete: false,
    step3_in_update_mode: false,
    header: { introMarkdown: '', featuredImage: null },
    dayCount: 1,
    days: [{ id: 'old', whereStaying: [], items: [] }],
    seoSection: {} as ListicleItineraryDraft['seoSection'],
    status: 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const plan: AutobuildResponse = {
  days: [
    {
      where_staying: [
        { block_type: 'itinerary-where-staying', collection: 'accommodations', item: 10, title: 'Grand Hotel', selection_reason: 'most comfortable, central' },
      ],
      items: [
        { slot_id: 'dinner', slot_label: 'Dinner', daypart: 'dinner', block_type: 'itinerary-dining', collection: 'dining', item: 1, title: 'Carmen', selection_reason: 'tasting-menu fine dining' },
        { slot_id: 'nightlife', slot_label: 'Nightlife', daypart: 'nightlife', block_type: 'itinerary-nightlife', collection: 'nightlife', item: 2, title: 'La Octava', selection_reason: 'upscale rooftop cocktails' },
      ],
    },
  ],
  plan_overview: 'A single luxurious foodie day anchored at the Grand Hotel.',
  model_used: 'gemini-2.5-flash-lite',
  notes: [],
  slot_issues: [],
  steps: [],
}

describe('applyAutobuildPlanToDraft', () => {
  it('replaces days with the plan, mapping stops + lodging with reasons', () => {
    const next = applyAutobuildPlanToDraft(baseDraft(), plan, ids)
    expect(next.dayCount).toBe(1)
    expect(next.days).toHaveLength(1)
    const day = next.days[0]
    expect(day.whereStaying.map((b) => [b.item, b.blockType, b.selectionReason])).toEqual([
      [10, 'itinerary-where-staying', 'most comfortable, central'],
    ])
    expect(day.items.map((b) => [b.item, b.blockType, b.selectionReason])).toEqual([
      [1, 'itinerary-dining', 'tasting-menu fine dining'],
      [2, 'itinerary-nightlife', 'upscale rooftop cocktails'],
    ])
  })

  it('records the plan overview and marks local changes', () => {
    const next = applyAutobuildPlanToDraft(baseDraft(), plan, ids)
    expect(next.planOverview).toBe('A single luxurious foodie day anchored at the Grand Hotel.')
    expect(next.hasLocalChanges).toBe(true)
    expect(next.generationBrief).toBe('luxury foodie day') // preserved
  })

  it('drops lodging slots with no record (no-hotel fallback)', () => {
    const fallback: AutobuildResponse = {
      ...plan,
      days: [
        {
          where_staying: [{ block_type: 'itinerary-where-staying', collection: 'accommodations', item: null, title: null, selection_reason: '' }],
          items: [{ slot_id: 'lunch', slot_label: 'Lunch', daypart: 'lunch', block_type: 'itinerary-dining', collection: 'dining', item: 1, title: 'Carmen', selection_reason: 'x' }],
        },
      ],
    }
    const next = applyAutobuildPlanToDraft(baseDraft(), fallback, ids)
    expect(next.days[0].whereStaying).toHaveLength(0)
    expect(next.days[0].items).toHaveLength(1)
  })

  it('leaves stop blocks without blurb or media (slots only)', () => {
    const next = applyAutobuildPlanToDraft(baseDraft(), plan, ids)
    const stop = next.days[0].items[0]
    expect(stop.blurbMarkdown).toBe('')
    expect(stop.selectedPhotos).toEqual([])
    expect(stop.image).toBeNull()
  })

  it('stores ABW-only shell slot metadata on generated stops', () => {
    const next = applyAutobuildPlanToDraft(baseDraft(), plan, ids)
    expect(next.days[0].items[0].shellSlotLabel).toBe('Dinner')
    expect(next.days[0].items[0].shellSlotDaypart).toBe('dinner')
  })
})
