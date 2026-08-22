import { buildPublicLocationView } from '@/features/location/public/view-model'

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

export function normalizeLocationGridCandidate(doc: LocationDocLike): LocationGridCandidate {
  const view = buildPublicLocationView(doc, { placement: 'card' })
  const coverImage = view.coverImage.url ? view.coverImage : null

  return {
    id: view.id ?? 0,
    level: view.level === 'neighborhood' ? 'neighborhood' : 'city',
    locationKey: view.locationKey,
    href: null,
    parentKey: view.parentKey,
    countryName: view.countryName,
    cityName: view.cityName,
    neighborhoodName: view.neighborhoodName,
    title: view.title,
    subtitle: view.subtitle,
    updatedAt: view.updatedAt,
    coverImageUrl: coverImage?.url ?? null,
    coverImageAlt: coverImage?.alt || null,
    coverImage,
  }
}
