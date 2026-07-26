import type { ListicleItineraryDraft } from '../../types'
import {
  findItineraryItemCollection,
  getItineraryItemCollection
} from './itinerary-item-collection'

export function removeItineraryItem(
  draft: ListicleItineraryDraft,
  itemId: string
): ListicleItineraryDraft {
  const days = draft.days.map((day) => {
    const collection = findItineraryItemCollection(day, itemId)
    if (!collection) return day

    return {
      ...day,
      [collection]: getItineraryItemCollection(day, collection).filter(
        (item) => item.id !== itemId
      )
    }
  })
  return { ...draft, days }
}
