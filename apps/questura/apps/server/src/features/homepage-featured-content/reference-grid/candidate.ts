import {
  resolveMediaSetForPlacement,
  type PublicImage,
} from '@/features/media/lib/resolve-public-image'

import { isRecord, normalizeNumericId } from './refs'

export type ReferenceCardHighlight = {
  key: string
  label: string
}

export type ReferenceCardCandidate = {
  id: number
  slot?: number
  title: string
  slug: string | null
  type: string | null
  priceLevel: string | null
  status: string | null
  updatedAt: string | null
  /** @deprecated Read `image.url` instead. Kept for back-compat. */
  imageUrl: string | null
  image: PublicImage | null
  location: string | null
  dek: string | null
  highlights: ReferenceCardHighlight[]
  bookingUrl: string | null
}

export type ReferenceCardCandidateConfig<TDoc> = {
  slug: (doc: TDoc) => string | null
  type: (doc: TDoc) => string | null
  priceLevel: (doc: TDoc) => string | null
  image: (doc: TDoc) => PublicImage | null
  location: (doc: TDoc) => string | null
}

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function uniqueLocationLabels(parts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const value = text(part)
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function titleCaseSegment(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function locationLabelFromPipeKey(value: string): string | null {
  const labels = uniqueLocationLabels(value.split('|').map(titleCaseSegment))
  return labels.length > 0 ? labels.join(', ') : null
}

export function locationLabelFromLocationRef(value: unknown): string | null {
  if (!isRecord(value)) return null
  const labels = uniqueLocationLabels([
    text(value.countryName),
    text(value.cityName),
    text(value.neighborhoodName),
  ])
  if (labels.length > 0) return labels.join(', ')
  const key = text(value.locationKey)
  return key ? locationLabelFromPipeKey(key) : null
}

export function locationLabelFromDoc(locationRef: unknown, location: unknown): string | null {
  const fromRef = locationLabelFromLocationRef(locationRef)
  if (fromRef) return fromRef
  const fromLegacy = locationFromLegacyLocation(location)
  if (fromLegacy) return fromLegacy
  if (typeof location === 'string' && location.includes('|')) {
    return locationLabelFromPipeKey(location)
  }
  return text(location)
}

export function httpUrl(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function imageFromMediaSet(value: unknown): PublicImage | null {
  if (!isRecord(value)) return null
  const resolved = resolveMediaSetForPlacement(value, 'card')
  return resolved.url ? resolved : null
}

export function imageFromFirstGalleryItem(gallery: unknown): PublicImage | null {
  if (!Array.isArray(gallery) || gallery.length === 0) return null
  const first = gallery[0]
  if (!isRecord(first)) return null
  return imageFromMediaSet(first.image)
}

export function locationFromLegacyLocation(value: unknown): string | null {
  if (!isRecord(value)) return null
  return text(value.city) ?? text(value.country) ?? text(value.value)
}

export function normalizeReferenceCardCandidate<
  TDoc extends { id?: unknown; title?: unknown; status?: unknown; updatedAt?: unknown },
>(doc: TDoc, config: ReferenceCardCandidateConfig<TDoc>): ReferenceCardCandidate {
  const image = config.image(doc)
  return {
    id: normalizeNumericId(doc.id) ?? 0,
    title: text(doc.title) ?? 'Untitled',
    slug: config.slug(doc),
    type: config.type(doc),
    priceLevel: config.priceLevel(doc),
    status: text(doc.status),
    updatedAt: text(doc.updatedAt),
    imageUrl: image?.url ?? null,
    image,
    location: config.location(doc),
    dek: null,
    highlights: [],
    bookingUrl: null,
  }
}

export function sortReferenceCandidates(
  left: { updatedAt: string | null; title: string },
  right: { updatedAt: string | null; title: string },
): number {
  const leftTimestamp = Date.parse(left.updatedAt || '') || 0
  const rightTimestamp = Date.parse(right.updatedAt || '') || 0
  if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp
  return left.title.localeCompare(right.title)
}

export { isRecord, normalizeNumericId }
