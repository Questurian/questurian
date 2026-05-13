import { getMediaSetPreviewAsset } from '@/features/media/lib/media-set-preview'

import type { HomepageTourCandidate, TourDocLike } from '../types'

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

function extractImageUrl(doc: TourDocLike): string | null {
  if (!isRecord(doc.img)) return null
  const fromMediaSet = getMediaSetPreviewAsset(
    doc.img as Parameters<typeof getMediaSetPreviewAsset>[0],
  )
  if (fromMediaSet?.url && typeof fromMediaSet.url === 'string' && fromMediaSet.url) {
    return fromMediaSet.url
  }
  const bunnyUrl = doc.img.bunny_original_url
  if (typeof bunnyUrl === 'string' && bunnyUrl) return bunnyUrl
  const url = doc.img.url
  return typeof url === 'string' && url ? url : null
}

function extractLocation(doc: TourDocLike): string | null {
  if (!isRecord(doc.locationRef)) return null
  const loc = doc.locationRef
  if (typeof loc.cityName === 'string' && loc.cityName.trim()) return loc.cityName.trim()
  if (typeof loc.countryName === 'string' && loc.countryName.trim()) return loc.countryName.trim()
  if (typeof loc.locationKey === 'string' && loc.locationKey.trim()) return loc.locationKey.trim()
  return null
}

export function normalizeTourCandidate(doc: TourDocLike): HomepageTourCandidate {
  return {
    id: normalizeNumericId(doc.id) ?? 0,
    title: typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : 'Untitled',
    slug:
      typeof doc.bookingLink === 'string' && doc.bookingLink.trim() ? doc.bookingLink.trim() : null,
    type: 'tour',
    priceLevel: typeof doc.price === 'string' && doc.price.trim() ? doc.price.trim() : null,
    status: typeof doc.status === 'string' && doc.status.trim() ? doc.status : null,
    updatedAt: typeof doc.updatedAt === 'string' && doc.updatedAt.trim() ? doc.updatedAt : null,
    imageUrl: extractImageUrl(doc),
    location: extractLocation(doc),
  }
}

export function sortTours(left: HomepageTourCandidate, right: HomepageTourCandidate): number {
  const leftTimestamp = Date.parse(left.updatedAt || '') || 0
  const rightTimestamp = Date.parse(right.updatedAt || '') || 0
  if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp
  return left.title.localeCompare(right.title)
}
