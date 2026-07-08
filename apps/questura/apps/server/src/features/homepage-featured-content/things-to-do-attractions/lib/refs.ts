import type { HomepageHotelItemRef } from '../../types'
import type { ParsedAttractionSlot } from '../types'

import {
  buildNumericReferenceGridData,
  normalizeNumericReference,
  normalizeNumericReferenceInput,
  parseNumericReferenceSlots,
} from '../../reference-grid/refs'

export function normalizeThingsToDoAttractionRef(value: unknown): HomepageHotelItemRef | null {
  return normalizeNumericReference(value)
}

export function normalizeThingsToDoAttractionsInput(rawItems: unknown): HomepageHotelItemRef[] {
  return normalizeNumericReferenceInput(
    rawItems,
    'Things to Do (places) items must use numeric attraction ids.',
  )
}

export function parseAttractionSlots(rawItems: unknown): ParsedAttractionSlot[] {
  return parseNumericReferenceSlots(rawItems)
}

export function buildThingsToDoAttractionsGlobalData(items: HomepageHotelItemRef[]) {
  return buildNumericReferenceGridData(items)
}
