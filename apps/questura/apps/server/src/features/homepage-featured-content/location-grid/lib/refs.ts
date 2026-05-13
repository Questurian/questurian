import type { LocationGridItemRef, ParsedLocationGridSlot } from '../types'

import { isRecord, normalizeNumericId } from './candidate'

export function normalizeLocationGridRef(value: unknown): LocationGridItemRef | null {
  const directId = normalizeNumericId(value)
  if (directId !== null) {
    return { id: directId }
  }

  if (!isRecord(value)) return null

  const nestedId = normalizeNumericId(value.id)
  if (nestedId !== null) {
    return { id: nestedId }
  }

  const nestedValue = value.value
  if (isRecord(nestedValue)) {
    const nestedValueId = normalizeNumericId(nestedValue.id)
    if (nestedValueId !== null) {
      return { id: nestedValueId }
    }
  }

  const valueId = normalizeNumericId(nestedValue)
  if (valueId !== null) {
    return { id: valueId }
  }

  return null
}

export function normalizeLocationGridInput(rawItems: unknown): LocationGridItemRef[] {
  if (!Array.isArray(rawItems)) return []

  const refs = rawItems.map((item) => normalizeLocationGridRef(item))

  if (refs.some((item) => item === null)) {
    throw new Error('Location grid items must use numeric location ids.')
  }

  return refs as LocationGridItemRef[]
}

export function parseLocationGridSlots(rawItems: unknown): ParsedLocationGridSlot[] {
  if (!Array.isArray(rawItems)) return []

  return rawItems.map((rawItem, index) => {
    const ref = normalizeLocationGridRef(rawItem)

    return {
      slot: index + 1,
      ref,
      reason: ref ? null : 'invalid_reference',
    }
  })
}

export function buildLocationGridGlobalData(items: LocationGridItemRef[]) {
  return {
    items: items.map((item) => item.id),
  }
}
