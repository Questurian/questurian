import type { HomepageHotelItemRef } from '../../types'
import type { ParsedAttractionSlot } from '../types'

import { isRecord, normalizeNumericId } from './candidate'

export function normalizeThingsToDoAttractionRef(value: unknown): HomepageHotelItemRef | null {
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

export function normalizeThingsToDoAttractionsInput(rawItems: unknown): HomepageHotelItemRef[] {
  if (!Array.isArray(rawItems)) return []
  const refs = rawItems.map((item) => normalizeThingsToDoAttractionRef(item))
  if (refs.some((item) => item === null)) {
    throw new Error('Things to Do (places) items must use numeric attraction ids.')
  }
  return refs as HomepageHotelItemRef[]
}

export function parseAttractionSlots(rawItems: unknown): ParsedAttractionSlot[] {
  if (!Array.isArray(rawItems)) return []
  return rawItems.map((rawItem, index) => {
    const ref = normalizeThingsToDoAttractionRef(rawItem)
    return { slot: index + 1, ref, reason: ref ? null : 'invalid_reference' }
  })
}

export function buildThingsToDoAttractionsGlobalData(items: HomepageHotelItemRef[]) {
  return { items: items.map((item) => item.id) }
}
