import type { Payload } from 'payload'

import type { HomepageHotelSelection } from '../../types'
import type { ThingsToDoAttractionsSelectionOptions } from '../types'

import { parseAttractionSlots } from '../lib/refs'
import { findAttractionDoc } from '../lib/repository'
import { getNumericReferenceGridSelectionFromItems } from '../../reference-grid/numeric-grid'

export async function getThingsToDoAttractionsSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: ThingsToDoAttractionsSelectionOptions = {},
): Promise<HomepageHotelSelection> {
  return getNumericReferenceGridSelectionFromItems(payload, rawItems, options, {
    findDoc: findAttractionDoc,
    parseSlots: parseAttractionSlots,
  })
}
