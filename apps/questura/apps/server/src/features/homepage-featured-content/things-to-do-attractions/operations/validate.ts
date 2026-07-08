import type { Payload } from 'payload'

import type { HomepageHotelItemRef } from '../../types'
import type { ThingsToDoAttractionsValidationOptions } from '../types'

import { findAttractionDoc } from '../lib/repository'
import { validateNumericReferenceGridItems } from '../../reference-grid/numeric-grid'

export async function validateThingsToDoAttractionsItems(
  payload: Payload,
  refs: HomepageHotelItemRef[],
  options: ThingsToDoAttractionsValidationOptions = {},
): Promise<HomepageHotelItemRef[]> {
  return validateNumericReferenceGridItems(payload, refs, options, {
    findDoc: findAttractionDoc,
    duplicateMessage: 'Things to Do (places) cannot contain duplicate attractions.',
    notFoundMessage: (ref) => `Attraction #${ref.id} could not be found.`,
    unpublishedMessage: (candidate) =>
      `Attraction "${candidate.title}" must be published before it can be featured.`,
    missingImageMessage: (candidate) =>
      `Attraction "${candidate.title}" is missing a gallery card image. Add a media set with the required card variant before featuring it.`,
  })
}
