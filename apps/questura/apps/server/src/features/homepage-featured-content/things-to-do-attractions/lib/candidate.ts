import {
  resolveMediaSetForPlacement,
  type PublicImage,
} from '@/features/media/lib/resolve-public-image'

import type { HomepageHotelCandidate } from '../../types'
import type { AttractionDocLike } from '../types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeNumericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return null
}

function extractCardImage(doc: AttractionDocLike): PublicImage | null {
  if (!Array.isArray(doc.gallery) || doc.gallery.length === 0) return null
  const first = doc.gallery[0]
  if (!isRecord(first)) return null
  const image = first.image
  if (!isRecord(image)) return null
  const resolved = resolveMediaSetForPlacement(image, 'card')
  return resolved.url ? resolved : null
}

function extractLocation(doc: AttractionDocLike): string | null {
  if (!isRecord(doc.location)) return null
  const value = doc.location
  if (typeof value.city === 'string' && value.city.trim()) return value.city
  if (typeof value.country === 'string' && value.country.trim()) return value.country
  if (typeof value.value === 'string' && value.value.trim()) return value.value
  return null
}

export function normalizeAttractionCandidate(doc: AttractionDocLike): HomepageHotelCandidate {
  const image = extractCardImage(doc)
  return {
    id: normalizeNumericId(doc.id) ?? 0,
    title: typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : 'Untitled',
    slug: typeof doc.slug === 'string' && doc.slug.trim() ? doc.slug : null,
    type: typeof doc.type === 'string' && doc.type.trim() ? doc.type : null,
    priceLevel:
      typeof doc.priceLevel === 'string' && doc.priceLevel.trim() ? doc.priceLevel : null,
    status: typeof doc.status === 'string' && doc.status.trim() ? doc.status : null,
    updatedAt: typeof doc.updatedAt === 'string' && doc.updatedAt.trim() ? doc.updatedAt : null,
    imageUrl: image?.url ?? null,
    image,
    location: extractLocation(doc),
  }
}

export function sortAttractions(
  left: HomepageHotelCandidate,
  right: HomepageHotelCandidate,
): number {
  const leftTimestamp = Date.parse(left.updatedAt || '') || 0
  const rightTimestamp = Date.parse(right.updatedAt || '') || 0
  if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp
  return left.title.localeCompare(right.title)
}
