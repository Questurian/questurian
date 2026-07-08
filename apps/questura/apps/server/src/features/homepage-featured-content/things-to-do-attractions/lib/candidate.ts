import type { HomepageHotelCandidate } from '../../types'
import type { AttractionDocLike } from '../types'

import {
  imageFromFirstGalleryItem,
  locationFromLegacyLocation,
  normalizeReferenceCardCandidate,
  sortReferenceCandidates,
} from '../../reference-grid/candidate'

export function normalizeAttractionCandidate(doc: AttractionDocLike): HomepageHotelCandidate {
  return normalizeReferenceCardCandidate(doc, {
    slug: (value) => (typeof value.slug === 'string' && value.slug.trim() ? value.slug : null),
    type: (value) => (typeof value.type === 'string' && value.type.trim() ? value.type : null),
    priceLevel: (value) =>
      typeof value.priceLevel === 'string' && value.priceLevel.trim() ? value.priceLevel : null,
    image: (value) => imageFromFirstGalleryItem(value.gallery),
    location: (value) => locationFromLegacyLocation(value.location),
  })
}

export function sortAttractions(
  left: HomepageHotelCandidate,
  right: HomepageHotelCandidate,
): number {
  return sortReferenceCandidates(left, right)
}

export { isRecord, normalizeNumericId } from '../../reference-grid/candidate'
