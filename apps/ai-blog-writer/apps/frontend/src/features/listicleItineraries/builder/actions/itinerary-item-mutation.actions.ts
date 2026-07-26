import type { ItineraryItemBlock, ListicleItineraryDraft } from '../../types'
import { resolveItineraryStopIdentityKey } from '../../types'
import {
  findItineraryItemCollection,
  getItineraryItemCollection
} from './itinerary-item-collection'

export type ItineraryItemUpdater = (
  item: ItineraryItemBlock
) => ItineraryItemBlock

/**
 * Identity changes invalidate copy about the previous venue and re-arm the
 * Selection reason gate. Non-identity edits preserve that editorial work.
 */
export function applyItineraryItemUpdate(
  item: ItineraryItemBlock,
  updater: ItineraryItemUpdater
): ItineraryItemBlock {
  const next = updater(item)
  if (
    resolveItineraryStopIdentityKey(next) ===
    resolveItineraryStopIdentityKey(item)
  ) {
    return next
  }
  return {
    ...next,
    selectionReason: '',
    blurbMarkdown: '',
    blurbJsonText: '',
    blurbLexical: undefined
  }
}

export function updateItineraryItem(
  draft: ListicleItineraryDraft,
  itemId: string,
  updater: ItineraryItemUpdater
): ListicleItineraryDraft {
  const days = draft.days.map((day) => {
    const collection = findItineraryItemCollection(day, itemId)
    if (!collection) return day

    return {
      ...day,
      [collection]: getItineraryItemCollection(day, collection).map((item) =>
        item.id === itemId ? applyItineraryItemUpdate(item, updater) : item
      )
    }
  })
  return { ...draft, days }
}
