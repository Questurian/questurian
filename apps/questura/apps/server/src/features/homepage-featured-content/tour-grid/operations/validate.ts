import type { Payload } from 'payload'

import type { HomepageTourItemRef, TourGridValidationOptions } from '../types'

import { findTourDoc } from '../lib/repository'
import { validateNumericReferenceGridItems } from '../../reference-grid/numeric-grid'

export async function validateTourGridItems(
  payload: Payload,
  refs: HomepageTourItemRef[],
  options: TourGridValidationOptions = {},
): Promise<HomepageTourItemRef[]> {
  return validateNumericReferenceGridItems(payload, refs, options, {
    findDoc: findTourDoc,
    duplicateMessage: 'Tour grid cannot contain duplicate tours.',
    notFoundMessage: (ref) => `Tour #${ref.id} could not be found.`,
    unpublishedMessage: (candidate) =>
      `Tour "${candidate.title}" must be published before it can be featured.`,
    missingImageMessage: (candidate) =>
      `Tour "${candidate.title}" is missing a card image. Add a media set with the required card variant before featuring it.`,
  })
}
