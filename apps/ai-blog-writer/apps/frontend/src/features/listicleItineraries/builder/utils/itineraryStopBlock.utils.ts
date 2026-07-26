import type {
  ItineraryBlockType,
  ItineraryDaySlice,
  ItineraryItemBlock,
  RelatedItemOption,
  TourAgencyKeyLocationRow,
} from '../../types'
import { isManualItineraryBlockType } from '../../types'

export function resolveStopTitle(
  item: ItineraryItemBlock,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string {
  if (isManualItineraryBlockType(item.blockType)) {
    return item.title.trim() || item.operator.trim()
  }
  if (!item.item) return ''
  const relatedOptions = relatedByBlockType[item.blockType] || []
  return relatedOptions.find((entry) => entry.id === item.item)?.title?.trim() || ''
}

/** Resolved stops in the same lodging-first order used by the article. */
export function getResolvedDayStops(
  day: ItineraryDaySlice,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): ItineraryItemBlock[] {
  return [...day.whereStaying, ...day.items].filter((item) =>
    Boolean(resolveStopTitle(item, relatedByBlockType)),
  )
}

export function createKeyLocationRow(
  itemId: string,
  source: TourAgencyKeyLocationRow['source'],
): TourAgencyKeyLocationRow {
  return {
    id: `${itemId}_key_location_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source,
    relatedCollection: source === 'existing' ? 'key-locations' : null,
    relatedItem: null,
    title: '',
    latitude: '',
    longitude: '',
  }
}

export function formatTourDurationLabel(hours: number): string {
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

export function resetItemForBlockType(
  item: ItineraryItemBlock,
  blockType: ItineraryBlockType,
): ItineraryItemBlock {
  return {
    ...item,
    blockType,
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
    startingPoint: {
      label: '',
      latitude: '',
      longitude: '',
    },
    keyLocations: [],
    image: null,
    instagramPost: null,
    // The autobuild "Why this pick" rationale described the previous pick; a new
    // block type means a new slot, so drop it (ADR 0018).
    selectionReason: '',
  }
}
