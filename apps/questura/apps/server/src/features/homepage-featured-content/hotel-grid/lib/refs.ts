import type { HomepageHotelItemRef, ParsedHotelSlot } from '../types'

import { isRecord, normalizeNumericId } from './candidate'

export function normalizeHotelGridRef(value: unknown): HomepageHotelItemRef | null {
  if (typeof value === 'number' || typeof value === 'string') {
    const id = normalizeNumericId(value)
    return id ? { id } : null
  }

  if (!isRecord(value)) return null
  const directId = normalizeNumericId(value.id)
  if (directId !== null) return { id: directId }
  if (isRecord(value.value)) {
    const nestedId = normalizeNumericId(value.value.id)
    if (nestedId !== null) return { id: nestedId }
  }
  const valueId = normalizeNumericId(value.value)
  if (valueId !== null) return { id: valueId }
  return null
}

export function normalizeHotelGridInput(rawItems: unknown): HomepageHotelItemRef[] {
  if (!Array.isArray(rawItems)) return []
  const refs = rawItems.map((item) => normalizeHotelGridRef(item))
  if (refs.some((item) => item === null)) {
    throw new Error('Hotel grid items must use numeric accommodation ids.')
  }
  return refs as HomepageHotelItemRef[]
}

export function parseHotelGridSlots(rawItems: unknown): ParsedHotelSlot[] {
  if (!Array.isArray(rawItems)) return []
  return rawItems.map((rawItem, index) => {
    const ref = normalizeHotelGridRef(rawItem)
    return { slot: index + 1, ref, reason: ref ? null : 'invalid_reference' }
  })
}

export function buildHotelGridGlobalData(items: HomepageHotelItemRef[]) {
  return { items: items.map((item) => item.id) }
}
