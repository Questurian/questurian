import type { Payload } from 'payload'

import type { HomepageHotelItemRef, HotelGridValidationOptions } from '../types'

import { findHotelDoc } from '../lib/repository'
import { validateNumericReferenceGridItems } from '../../reference-grid/numeric-grid'

export async function validateHotelGridItems(
  payload: Payload,
  refs: HomepageHotelItemRef[],
  options: HotelGridValidationOptions = {},
): Promise<HomepageHotelItemRef[]> {
  return validateNumericReferenceGridItems(payload, refs, options, {
    findDoc: findHotelDoc,
    duplicateMessage: 'Hotel grid cannot contain duplicate hotels.',
    notFoundMessage: (ref) => `Accommodation #${ref.id} could not be found.`,
    unpublishedMessage: (candidate) =>
      `Hotel "${candidate.title}" must be published before it can be featured.`,
    missingImageMessage: (candidate) =>
      `Hotel "${candidate.title}" is missing a gallery card image. Add a media set with the required card variant before featuring it.`,
  })
}
