import type { AccommodationDocLike, HomepageHotelCandidate } from '../types'

import {
  imageFromFirstGalleryItem,
  locationFromLegacyLocation,
  normalizeReferenceCardCandidate,
  sortReferenceCandidates,
} from '../../reference-grid/candidate'

export function normalizeHotelCandidate(doc: AccommodationDocLike): HomepageHotelCandidate {
  return normalizeReferenceCardCandidate(doc, {
    slug: (value) => (typeof value.slug === 'string' && value.slug.trim() ? value.slug : null),
    type: (value) => (typeof value.type === 'string' && value.type.trim() ? value.type : null),
    priceLevel: (value) =>
      typeof value.priceLevel === 'string' && value.priceLevel.trim() ? value.priceLevel : null,
    image: (value) => imageFromFirstGalleryItem(value.gallery),
    location: (value) => locationFromLegacyLocation(value.location),
  })
}

export function sortHotels(left: HomepageHotelCandidate, right: HomepageHotelCandidate): number {
  return sortReferenceCandidates(left, right)
}

export { isRecord, normalizeNumericId } from '../../reference-grid/candidate'
