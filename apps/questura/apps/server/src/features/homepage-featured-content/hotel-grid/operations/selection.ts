import type { Payload } from 'payload'

import type { HomepageHotelSelection, HotelGridSelectionOptions } from '../types'

import { parseHotelGridSlots } from '../lib/refs'
import { findHotelDoc } from '../lib/repository'
import { getNumericReferenceGridSelectionFromItems } from '../../reference-grid/numeric-grid'

export async function getHotelGridSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: HotelGridSelectionOptions = {},
): Promise<HomepageHotelSelection> {
  return getNumericReferenceGridSelectionFromItems(payload, rawItems, options, {
    findDoc: findHotelDoc,
    parseSlots: parseHotelGridSlots,
  })
}
