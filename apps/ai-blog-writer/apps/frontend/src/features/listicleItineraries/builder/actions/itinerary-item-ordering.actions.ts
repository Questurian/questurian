import type { ListicleItineraryDraft } from '../../types'
import {
  findItineraryItemCollection,
  getItineraryItemCollection
} from './itinerary-item-collection'

export type ItineraryItemMoveDirection = 'up' | 'down'

export function moveItineraryItem(
  draft: ListicleItineraryDraft,
  itemId: string,
  direction: ItineraryItemMoveDirection
): ListicleItineraryDraft {
  const days = draft.days.map((day) => {
    const collection = findItineraryItemCollection(day, itemId)
    if (!collection) return day

    const items = [...getItineraryItemCollection(day, collection)]
    const index = items.findIndex((item) => item.id === itemId)
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= items.length) return day

    const [item] = items.splice(index, 1)
    items.splice(target, 0, item)
    return { ...day, [collection]: items }
  })
  return { ...draft, days }
}
