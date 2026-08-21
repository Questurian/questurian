import type { HomepageHotelCandidate } from '../../types'
import type { AttractionDocLike } from '../types'

import {
  httpUrl,
  imageFromFirstGalleryItem,
  isRecord,
  locationLabelFromDoc,
  normalizeReferenceCardCandidate,
  sortReferenceCandidates,
  text,
  type ReferenceCardHighlight,
} from '../../reference-grid/candidate'

function detailsGroup(doc: AttractionDocLike, key: 'core' | 'visit'): Record<string, unknown> {
  const details = isRecord(doc.attractionsDetails) ? doc.attractionsDetails : null
  const value = details?.[key]
  return isRecord(value) ? value : {}
}

export function normalizeAttractionCandidate(doc: AttractionDocLike): HomepageHotelCandidate {
  const core = detailsGroup(doc, 'core')
  const visit = detailsGroup(doc, 'visit')
  const highlights: ReferenceCardHighlight[] =
    visit.bookingRequired === true ? [{ key: 'booking', label: 'Booking required' }] : []

  return {
    ...normalizeReferenceCardCandidate(doc, {
      slug: (value) => text(value.slug),
      type: (value) => text(core.attractionType) || text(value.type),
      priceLevel: (value) => text(core.pricing) || text(value.priceLevel),
      image: (value) => imageFromFirstGalleryItem(value.gallery),
      location: (value) => locationLabelFromDoc(value.locationRef, value.location),
    }),
    highlights,
    bookingUrl: httpUrl(visit.bookingUrl),
  }
}

export function sortAttractions(
  left: HomepageHotelCandidate,
  right: HomepageHotelCandidate,
): number {
  return sortReferenceCandidates(left, right)
}

export { isRecord, normalizeNumericId } from '../../reference-grid/candidate'
