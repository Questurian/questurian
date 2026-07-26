import type { ItineraryItemBlock, ListicleItineraryDraft } from '../../types'
import { WHERE_STAYING_BLOCK_TYPE } from '../../types'

export type ItineraryItemIdFactory = () => string

export const createItineraryItemId: ItineraryItemIdFactory = () =>
  `item_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

export function createEmptyItineraryStop(
  createId: ItineraryItemIdFactory = createItineraryItemId
): ItineraryItemBlock {
  return {
    id: createId(),
    blockType: 'itinerary-dining',
    item: null,
    moment: null,
    momentLabel: '',
    tours: [],
    mediaMode: 'photos',
    selectedPhotos: [],
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
    blurbMarkdown: '',
    blurbLexical: undefined,
    blurbJsonText: '',
    // Operator-added stops have no Autobuild rationale. The empty string keeps
    // "Why this pick" visible and re-arms the day-compose gate (ADR 0020).
    selectionReason: ''
  }
}

export function createEmptyWhereStayingItem(
  createId: ItineraryItemIdFactory = createItineraryItemId
): ItineraryItemBlock {
  return {
    ...createEmptyItineraryStop(createId),
    blockType: WHERE_STAYING_BLOCK_TYPE
  }
}

export function addItineraryStop(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  insertIndex?: number,
  createItem: () => ItineraryItemBlock = createEmptyItineraryStop
): ListicleItineraryDraft {
  const day = draft.days[dayIndex]
  if (!day) return draft

  const items = [...day.items]
  const at =
    insertIndex === undefined
      ? items.length
      : Math.max(0, Math.min(insertIndex, items.length))
  items.splice(at, 0, createItem())

  const days = [...draft.days]
  days[dayIndex] = { ...day, items }
  return { ...draft, days }
}

export function addWhereStayingItem(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  createItem: () => ItineraryItemBlock = createEmptyWhereStayingItem
): ListicleItineraryDraft {
  const day = draft.days[dayIndex]
  if (!day) return draft

  const days = [...draft.days]
  days[dayIndex] = {
    ...day,
    whereStaying: [...day.whereStaying, createItem()]
  }
  return { ...draft, days }
}
