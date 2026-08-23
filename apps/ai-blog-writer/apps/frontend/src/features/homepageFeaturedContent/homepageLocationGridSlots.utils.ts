import type {
  HomepageLocationGridCandidate,
  HomepageLocationGridItemRef,
  HomepageLocationGridSelection
} from './locationGridTypes'

export type LocationGridSlotValue = HomepageLocationGridCandidate | null

export function createEmptySlots(count: number): LocationGridSlotValue[] {
  return Array.from({ length: count }, () => null)
}

export function mapSelectionToSlots(
  selection: HomepageLocationGridSelection
): LocationGridSlotValue[] {
  const slots = createEmptySlots(selection.totalSlots)

  for (const item of selection.items) {
    if (!item.slot) continue
    const slotIndex = item.slot - 1
    if (slotIndex < 0 || slotIndex >= slots.length) continue
    slots[slotIndex] = item
  }

  return slots
}

export function areRefsEqual(left: LocationGridSlotValue, right: LocationGridSlotValue): boolean {
  if (!left && !right) return true
  if (!left || !right) return false

  return (
    left.id === right.id && left.kicker === right.kicker && left.description === right.description
  )
}

export function areSlotListsEqual(
  left: LocationGridSlotValue[] | null,
  right: LocationGridSlotValue[]
): boolean {
  if (!left) return false

  return (
    left.length === right.length && left.every((item, index) => areRefsEqual(item, right[index]))
  )
}

export function hasDuplicateSlots(slots: LocationGridSlotValue[]): boolean {
  const ids = new Set<number>()

  for (const item of slots) {
    if (!item) continue

    if (ids.has(item.id)) return true
    ids.add(item.id)
  }

  return false
}

export function buildSaveItems(slots: LocationGridSlotValue[]): HomepageLocationGridItemRef[] {
  return slots.flatMap((item) => {
    if (!item) return []

    return [
      {
        id: item.id,
        kicker: item.kicker?.trim() ?? '',
        description: item.description?.trim() ?? ''
      }
    ]
  })
}

export function hasCompleteDescriptions(slots: LocationGridSlotValue[]): boolean {
  return slots.every((item) => item === null || Boolean(item.description?.trim()))
}

export function hasCompleteKickers(slots: LocationGridSlotValue[]): boolean {
  return slots.every((item) => item === null || Boolean(item.kicker?.trim()))
}

export function invalidItemsBySlotMap<T extends { slot: number }>(items: T[]): Map<number, T> {
  const invalidItemsBySlot = new Map<number, T>()
  for (const item of items) {
    invalidItemsBySlot.set(item.slot, item)
  }
  return invalidItemsBySlot
}
