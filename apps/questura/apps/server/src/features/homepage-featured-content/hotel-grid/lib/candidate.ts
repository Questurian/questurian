import type { AccommodationDocLike, HomepageHotelCandidate } from '../types'

import {
  httpUrl,
  imageFromFirstGalleryItem,
  isRecord,
  normalizeReferenceCardCandidate,
  sortReferenceCandidates,
  text,
  type ReferenceCardHighlight,
} from '../../reference-grid/candidate'

const MAX_HIGHLIGHTS = 3
const POOL_PRIORITY = ['rooftop', 'infinity', 'outdoor', 'indoor'] as const

function group(
  doc: AccommodationDocLike,
  key: 'core' | 'theStay' | 'theExperience' | 'theDetails',
): Record<string, unknown> {
  const value = doc[key]
  return isRecord(value) ? value : {}
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

function vibeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

function neighborhoodFromPipeKey(value: unknown): string | null {
  const key = text(value)
  if (!key || !key.includes('|')) return null
  const parts = key.split('|')
  if (parts.length < 3) return null
  const last = parts[parts.length - 1]
  if (!last) return null
  return last
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function hotelLocation(doc: AccommodationDocLike): string | null {
  const district = text(group(doc, 'core').district)
  if (district) return district
  if (isRecord(doc.locationRef)) {
    const neighborhood = text(doc.locationRef.neighborhoodName)
    if (neighborhood) return neighborhood
  }
  const key =
    (isRecord(doc.locationRef) ? text(doc.locationRef.locationKey) : null) || doc.location
  return neighborhoodFromPipeKey(key)
}

function hotelHighlights(doc: AccommodationDocLike): ReferenceCardHighlight[] {
  const theStay = group(doc, 'theStay')
  const theExperience = group(doc, 'theExperience')
  const theDetails = group(doc, 'theDetails')
  const rows: ReferenceCardHighlight[] = []

  const push = (key: string, label: string | null | undefined) => {
    const value = text(label)
    if (!value) return
    if (rows.some((row) => row.label.toLowerCase() === value.toLowerCase())) return
    rows.push({ key, label: value })
  }

  const firstVibe = stringList(theExperience.vibe)[0]
  if (firstVibe) push(vibeKey(firstVibe), firstVibe)
  push('walkability', text(theDetails.walkability))

  const pools = stringList(theExperience.pool).map((item) => item.toLowerCase())
  const poolKind = POOL_PRIORITY.find((kind) => pools.includes(kind))
  if (poolKind) {
    push('pool', `${poolKind.charAt(0).toUpperCase()}${poolKind.slice(1)} pool`)
  }
  if (theExperience.rooftopLounge === true) push('rooftop', 'Rooftop lounge')
  if (theStay.breakfastServed === true) push('breakfast', 'Breakfast served')
  const gym = text(theExperience.gym)
  if (gym && gym !== 'None') push('gym', gym === '24/7' ? '24/7 gym' : `${gym} gym`)
  if (theExperience.restaurant === true) push('restaurant', 'Restaurant')
  if (theStay.kidFriendly === true) push('kids', 'Kid-friendly')
  if (theStay.wifi === true) push('wifi', 'Wi-Fi')

  return rows.slice(0, MAX_HIGHLIGHTS)
}

export function normalizeHotelCandidate(doc: AccommodationDocLike): HomepageHotelCandidate {
  const core = group(doc, 'core')
  const theDetails = group(doc, 'theDetails')

  return {
    ...normalizeReferenceCardCandidate(doc, {
      slug: (value) => text(value.slug),
      type: (value) => text(core.type) || text(value.type),
      priceLevel: (value) => text(core.price) || text(value.priceLevel),
      image: (value) => imageFromFirstGalleryItem(value.gallery),
      location: hotelLocation,
    }),
    highlights: hotelHighlights(doc),
    bookingUrl: httpUrl(theDetails.bookingUrl) || httpUrl(theDetails.websiteUrl),
  }
}

export function sortHotels(left: HomepageHotelCandidate, right: HomepageHotelCandidate): number {
  return sortReferenceCandidates(left, right)
}

export { isRecord, normalizeNumericId } from '../../reference-grid/candidate'
