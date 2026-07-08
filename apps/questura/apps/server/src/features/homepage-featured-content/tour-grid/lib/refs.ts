import type { HomepageTourItemRef, ParsedTourSlot } from '../types'

import {
  buildNumericReferenceGridData,
  normalizeNumericReference,
  normalizeNumericReferenceInput,
  parseNumericReferenceSlots,
} from '../../reference-grid/refs'

export function normalizeTourGridRef(value: unknown): HomepageTourItemRef | null {
  return normalizeNumericReference(value)
}

export function normalizeTourGridInput(rawItems: unknown): HomepageTourItemRef[] {
  return normalizeNumericReferenceInput(rawItems, 'Tour grid items must use numeric tour ids.')
}

export function parseTourGridSlots(rawItems: unknown): ParsedTourSlot[] {
  return parseNumericReferenceSlots(rawItems)
}

export function buildTourGridGlobalData(items: HomepageTourItemRef[]) {
  return buildNumericReferenceGridData(items)
}
