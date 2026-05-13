import type { HomepageTourItemRef, ParsedTourSlot } from '../types'

import { isRecord, normalizeNumericId } from './candidate'

export function normalizeTourGridRef(value: unknown): HomepageTourItemRef | null {
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

export function normalizeTourGridInput(rawItems: unknown): HomepageTourItemRef[] {
  if (!Array.isArray(rawItems)) return []
  const refs = rawItems.map((item) => normalizeTourGridRef(item))
  if (refs.some((item) => item === null)) {
    throw new Error('Tour grid items must use numeric tour ids.')
  }
  return refs as HomepageTourItemRef[]
}

export function parseTourGridSlots(rawItems: unknown): ParsedTourSlot[] {
  if (!Array.isArray(rawItems)) return []
  return rawItems.map((rawItem, index) => {
    const ref = normalizeTourGridRef(rawItem)
    return { slot: index + 1, ref, reason: ref ? null : 'invalid_reference' }
  })
}

export function buildTourGridGlobalData(items: HomepageTourItemRef[]) {
  return { items: items.map((item) => item.id) }
}
