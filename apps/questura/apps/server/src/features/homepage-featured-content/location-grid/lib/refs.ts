import { LOCATION_GRID_DESCRIPTION_MAX_LENGTH, LOCATION_GRID_KICKER_MAX_LENGTH } from '../constants'
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

export function normalizeLocationGridDescriptions(rawItems: unknown): string[] {
  if (!Array.isArray(rawItems)) return []

  return rawItems.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Location grid slot ${index + 1} needs supporting text.`)
    }

    const description = typeof item.description === 'string' ? item.description.trim() : ''
    if (!description) {
      throw new Error(`Location grid slot ${index + 1} needs supporting text.`)
    }
    if (description.length > LOCATION_GRID_DESCRIPTION_MAX_LENGTH) {
      throw new Error(
        `Location grid slot ${index + 1} supporting text must be ${LOCATION_GRID_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
      )
    }

    return description
  })
}

export function normalizeLocationGridKickers(rawItems: unknown): string[] {
  if (!Array.isArray(rawItems)) return []

  return rawItems.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Location grid slot ${index + 1} needs a kicker.`)
    }

    const kicker = typeof item.kicker === 'string' ? item.kicker.trim() : ''
    if (!kicker) {
      throw new Error(`Location grid slot ${index + 1} needs a kicker.`)
    }
    if (kicker.length > LOCATION_GRID_KICKER_MAX_LENGTH) {
      throw new Error(
        `Location grid slot ${index + 1} kicker must be ${LOCATION_GRID_KICKER_MAX_LENGTH} characters or fewer.`,
      )
    }

    return kicker
  })
}

export function parseStoredLocationGridDescriptions(value: unknown): Array<string | null> {
  if (!Array.isArray(value)) return []
  return value.map((description) =>
    typeof description === 'string' && description.trim() ? description.trim() : null,
  )
}

export function parseStoredLocationGridKickers(value: unknown): Array<string | null> {
  if (!Array.isArray(value)) return []
  return value.map((kicker) => (typeof kicker === 'string' && kicker.trim() ? kicker.trim() : null))
}
