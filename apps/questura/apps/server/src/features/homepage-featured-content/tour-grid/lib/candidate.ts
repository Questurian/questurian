import type { HomepageTourCandidate, TourDocLike } from '../types'

import {
  imageFromMediaSet,
  isRecord,
  normalizeReferenceCardCandidate,
  sortReferenceCandidates,
} from '../../reference-grid/candidate'

function extractLocation(doc: TourDocLike): string | null {
  if (!isRecord(doc.locationRef)) return null
  const loc = doc.locationRef
  if (typeof loc.cityName === 'string' && loc.cityName.trim()) return loc.cityName.trim()
  if (typeof loc.countryName === 'string' && loc.countryName.trim()) return loc.countryName.trim()
  if (typeof loc.locationKey === 'string' && loc.locationKey.trim()) return loc.locationKey.trim()
  return null
}

export function normalizeTourCandidate(doc: TourDocLike): HomepageTourCandidate {
  return normalizeReferenceCardCandidate(doc, {
    slug: (value) =>
      typeof value.bookingLink === 'string' && value.bookingLink.trim()
        ? value.bookingLink.trim()
        : null,
    type: () => 'tour',
    priceLevel: (value) =>
      typeof value.price === 'string' && value.price.trim() ? value.price.trim() : null,
    image: (value) => imageFromMediaSet(value.img),
    location: extractLocation,
  })
}

export function sortTours(left: HomepageTourCandidate, right: HomepageTourCandidate): number {
  return sortReferenceCandidates(left, right)
}

export { normalizeNumericId } from '../../reference-grid/candidate'
