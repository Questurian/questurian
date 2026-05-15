import {
  resolveMediaSetForPlacement,
  type PublicImage,
} from '@/features/media/lib/resolve-public-image'

import type { LocationDocLike, LocationGridCandidate } from '../types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeNumericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed)
    }
  }

  return null
}

function extractCoverImage(doc: LocationDocLike): PublicImage | null {
  if (!isRecord(doc.coverImage)) return null
  const resolved = resolveMediaSetForPlacement(doc.coverImage, 'card')
  return resolved.url ? resolved : null
}

function getLocationGridTitle(doc: LocationDocLike): string {
  if (typeof doc.neighborhoodName === 'string' && doc.neighborhoodName.trim()) {
    return doc.neighborhoodName.trim()
  }

  if (typeof doc.cityName === 'string' && doc.cityName.trim()) {
    return doc.cityName.trim()
  }

  if (typeof doc.countryName === 'string' && doc.countryName.trim()) {
    return doc.countryName.trim()
  }

  if (typeof doc.locationKey === 'string' && doc.locationKey.trim()) {
    return doc.locationKey.trim()
  }

  const id = normalizeNumericId(doc.id)
  return id ? `Location #${id}` : 'Untitled location'
}

function getLocationGridSubtitle(doc: LocationDocLike): string | null {
  if (doc.level === 'neighborhood') {
    const parts = [doc.cityName, doc.countryName]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
    return parts.length > 0 ? parts.join(', ') : null
  }

  if (typeof doc.countryName === 'string' && doc.countryName.trim()) {
    return doc.countryName.trim()
  }

  return null
}

export function normalizeLocationGridCandidate(doc: LocationDocLike): LocationGridCandidate {
  const coverImage = extractCoverImage(doc)
  return {
    id: normalizeNumericId(doc.id) ?? 0,
    level: doc.level === 'neighborhood' ? 'neighborhood' : 'city',
    locationKey:
      typeof doc.locationKey === 'string' && doc.locationKey.trim() ? doc.locationKey : null,
    parentKey: typeof doc.parentKey === 'string' && doc.parentKey.trim() ? doc.parentKey : null,
    countryName:
      typeof doc.countryName === 'string' && doc.countryName.trim() ? doc.countryName : null,
    cityName: typeof doc.cityName === 'string' && doc.cityName.trim() ? doc.cityName : null,
    neighborhoodName:
      typeof doc.neighborhoodName === 'string' && doc.neighborhoodName.trim()
        ? doc.neighborhoodName
        : null,
    title: getLocationGridTitle(doc),
    subtitle: getLocationGridSubtitle(doc),
    updatedAt: typeof doc.updatedAt === 'string' && doc.updatedAt.trim() ? doc.updatedAt : null,
    coverImageUrl: coverImage?.url ?? null,
    coverImageAlt: coverImage?.alt || null,
    coverImage,
  }
}
