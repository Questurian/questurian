import type {
  HomepageHotelGridInvalidItem,
  HomepageHotelGridItemRef,
  HomepageHotelGridSelection
} from './hotelGridTypes'
import type { HotelGridSlotValue } from './homepageHotelGridSlots.types'

export function mapHotelSelectionToSlots(
  selection: HomepageHotelGridSelection
): HotelGridSlotValue[] {
  const slots = Array.from<HotelGridSlotValue>(
    { length: selection.totalSlots },
    () => null
  )

  for (const item of selection.items) {
    if (!item.slot) continue
    const slotIndex = item.slot - 1
    if (slotIndex < 0 || slotIndex >= slots.length) continue
    slots[slotIndex] = item
  }

  return slots
}

export function areHotelSlotListsEqual(
  left: HotelGridSlotValue[] | null,
  right: HotelGridSlotValue[]
): boolean {
  if (!left) return false
  return (
    left.length === right.length &&
    left.every((item, index) => item?.id === right[index]?.id)
  )
}

export function buildHotelGridSaveItems(
  slots: HotelGridSlotValue[]
): HomepageHotelGridItemRef[] {
  return slots.flatMap((item) => (item ? [{ id: item.id }] : []))
}

export function mapHotelInvalidItemsBySlot(
  invalidItems: HomepageHotelGridInvalidItem[]
): Map<number, HomepageHotelGridInvalidItem> {
  return new Map(invalidItems.map((item) => [item.slot, item]))
}
