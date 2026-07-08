import type { HomepageHotelItemRef, ParsedHotelSlot } from '../types'

import {
  buildNumericReferenceGridData,
  normalizeNumericReference,
  normalizeNumericReferenceInput,
  parseNumericReferenceSlots,
} from '../../reference-grid/refs'

export function normalizeHotelGridRef(value: unknown): HomepageHotelItemRef | null {
  return normalizeNumericReference(value)
}

export function normalizeHotelGridInput(rawItems: unknown): HomepageHotelItemRef[] {
  return normalizeNumericReferenceInput(
    rawItems,
    'Hotel grid items must use numeric accommodation ids.',
  )
}

export function parseHotelGridSlots(rawItems: unknown): ParsedHotelSlot[] {
  return parseNumericReferenceSlots(rawItems)
}

export function buildHotelGridGlobalData(items: HomepageHotelItemRef[]) {
  return buildNumericReferenceGridData(items)
}
