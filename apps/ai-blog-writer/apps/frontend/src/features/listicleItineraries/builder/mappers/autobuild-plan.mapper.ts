import {
  WHERE_STAYING_BLOCK_TYPE,
  type ItineraryDaySlice,
  type ItineraryItemBlock,
  type ListicleItineraryDraft,
} from '../../types'
import type { AutobuildPlanStop, AutobuildPlanLodging, AutobuildResponse } from '../services/autobuild.api'

type IdFactory = (kind: 'day' | 'item', dayIndex: number, slotIndex: number) => string

const defaultIdFactory: IdFactory = (kind, dayIndex, slotIndex) =>
  `${kind}_${Date.now()}_${dayIndex}_${slotIndex}_${Math.random().toString(36).slice(2, 8)}`

/** A stop/lodging slot with no media or blurb — Autobuild fills slots only. */
function emptyBlock(id: string): ItineraryItemBlock {
  return {
    id,
    blockType: 'itinerary-dining',
    item: null,
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
    blurbLexical: undefined,
    blurbJsonText: '',
    selectionReason: '',
  }
}

function blockFromStop(stop: AutobuildPlanStop, id: string): ItineraryItemBlock {
  return {
    ...emptyBlock(id),
    blockType: stop.block_type,
    item: stop.item,
    title: stop.title || '',
    selectionReason: stop.selection_reason || '',
  }
}

function blockFromLodging(lodging: AutobuildPlanLodging, id: string): ItineraryItemBlock {
  return {
    ...emptyBlock(id),
    blockType: WHERE_STAYING_BLOCK_TYPE,
    item: lodging.item,
    title: lodging.title || '',
    selectionReason: lodging.selection_reason || '',
  }
}

const clampDays = (n: number) => Math.max(1, Math.min(7, n))

/**
 * Replace the draft's days with the Autobuild plan (slots + reasons only) and
 * record the plan overview. Pure: the confirm-before-replace guard lives in the
 * UI; this just produces the next draft. Lodging slots with no record (`item`
 * null — the no-hotel fallback) are dropped.
 */
export function applyAutobuildPlanToDraft(
  draft: ListicleItineraryDraft,
  plan: AutobuildResponse,
  idFactory: IdFactory = defaultIdFactory,
): ListicleItineraryDraft {
  const planDays = plan.days.length > 0 ? plan.days : [{ where_staying: [], items: [] }]

  const days: ItineraryDaySlice[] = planDays.map((day, dayIndex) => {
    const whereStaying = day.where_staying
      .filter((lodging) => typeof lodging.item === 'number')
      .map((lodging, slotIndex) => blockFromLodging(lodging, idFactory('item', dayIndex, slotIndex)))
    const items = day.items.map((stop, slotIndex) =>
      blockFromStop(stop, idFactory('item', dayIndex, 500 + slotIndex)),
    )
    return { id: idFactory('day', dayIndex, 0), whereStaying, items }
  })

  return {
    ...draft,
    dayCount: clampDays(days.length),
    days,
    planOverview: plan.plan_overview || '',
    hasLocalChanges: true,
    updatedAt: new Date().toISOString(),
  }
}
