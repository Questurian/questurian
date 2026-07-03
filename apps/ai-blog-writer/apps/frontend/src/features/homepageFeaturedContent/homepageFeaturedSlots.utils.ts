import type { HomepageFeaturedItemRef, HomepageFeaturedSelection } from './types'
import type { SlotValue } from './homepageFeaturedSlots.types'

export function createEmptySlots(count: number): SlotValue[] {
  return Array.from({ length: count }, () => null)
}

export function mapSelectionToSlots(selection: HomepageFeaturedSelection): SlotValue[] {
  const slots = createEmptySlots(selection.totalSlots)

  for (const item of selection.items) {
    if (!item.slot) continue
    const slotIndex = item.slot - 1
    if (slotIndex < 0 || slotIndex >= slots.length) continue
    slots[slotIndex] = item
  }

  return slots
}

function areRefsEqual(left: SlotValue, right: SlotValue): boolean {
  if (!left && !right) return true
  if (!left || !right) return false

  return left.id === right.id && left.relationTo === right.relationTo
}

export function areSlotListsEqual(left: SlotValue[] | null, right: SlotValue[]): boolean {
  if (!left) return false

  return left.length === right.length && left.every((item, index) => areRefsEqual(item, right[index]))
}

export function hasDuplicateSlots(slots: SlotValue[]): boolean {
  const keys = new Set<string>()

  for (const item of slots) {
    if (!item) continue

    const key = `${item.relationTo}:${item.id}`
    if (keys.has(key)) return true
    keys.add(key)
  }

  return false
}

export function buildSaveItems(slots: SlotValue[]): HomepageFeaturedItemRef[] {
  return slots.flatMap((item) => {
    if (!item) return []

    return [{ relationTo: item.relationTo, id: item.id }]
  })
}
