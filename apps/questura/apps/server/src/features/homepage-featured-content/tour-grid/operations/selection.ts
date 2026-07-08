import type { Payload } from 'payload'

import type { HomepageTourSelection, TourGridSelectionOptions } from '../types'

import { parseTourGridSlots } from '../lib/refs'
import { findTourDoc } from '../lib/repository'
import { getNumericReferenceGridSelectionFromItems } from '../../reference-grid/numeric-grid'

export async function getTourGridSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: TourGridSelectionOptions = {},
): Promise<HomepageTourSelection> {
  return getNumericReferenceGridSelectionFromItems(payload, rawItems, options, {
    findDoc: findTourDoc,
    parseSlots: parseTourGridSlots,
  })
}
