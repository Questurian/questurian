import type { ItineraryDaySlice, ItineraryItemBlock } from '../../types'

export type ItineraryItemCollectionKey = 'whereStaying' | 'items'

/**
 * Resolve the physical collection for an item within a day.
 *
 * Lodging wins when legacy/corrupt data repeats an id in both collections,
 * matching the builder's long-standing update, remove, and move behavior.
 */
export function findItineraryItemCollection(
  day: ItineraryDaySlice,
  itemId: string
): ItineraryItemCollectionKey | null {
  if (day.whereStaying.some((item) => item.id === itemId)) {
    return 'whereStaying'
  }
  if (day.items.some((item) => item.id === itemId)) {
    return 'items'
  }
  return null
}

export function getItineraryItemCollection(
  day: ItineraryDaySlice,
  collection: ItineraryItemCollectionKey
): ItineraryItemBlock[] {
  return day[collection]
}
