import {
  resolveMediaSetForPlacement,
  type MediaPlacement,
  type PublicImage,
} from '@/features/media/lib/resolve-public-image'

export type LocationLevel = 'country' | 'city' | 'neighborhood'

export type LocationDocLike = {
  id?: unknown
  level?: unknown
  locationKey?: unknown
  parentKey?: unknown
  countryName?: unknown
  cityName?: unknown
  neighborhoodName?: unknown
  coverImage?: unknown
  updatedAt?: unknown
}

export type PublicLocationView = {
  id: number | null
  level: LocationLevel | null
  locationKey: string | null
  parentKey: string | null
  countryName: string | null
  cityName: string | null
  neighborhoodName: string | null
  title: string
  subtitle: string | null
  coverImage: PublicImage
  updatedAt: string | null
}

export type BuildPublicLocationViewOptions = {
  /**
   * Placement context for the cover image. The view's `coverImage` is resolved
   * for this placement (e.g. 'card' on a grid, 'hero' on a guide page).
   */
  placement: MediaPlacement
  /**
   * Allow legacy migration fallbacks during rollout. Defaults to true while
   * coverage is incomplete; production callers should flip to false once a
   * collection's MediaSet backfill is verified.
   */
  allowMigrationFallback?: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const stringOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const numericIdOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return null
}

const levelOrNull = (value: unknown): LocationLevel | null => {
  if (value === 'country' || value === 'city' || value === 'neighborhood') return value
  return null
}

const buildTitle = (doc: LocationDocLike, id: number | null): string => {
  return (
    stringOrNull(doc.neighborhoodName) ??
    stringOrNull(doc.cityName) ??
    stringOrNull(doc.countryName) ??
    stringOrNull(doc.locationKey) ??
    (id ? `Location #${id}` : 'Untitled location')
  )
}

const buildSubtitle = (doc: LocationDocLike, level: LocationLevel | null): string | null => {
  if (level === 'neighborhood') {
    const parts = [stringOrNull(doc.cityName), stringOrNull(doc.countryName)].filter(
      (part): part is string => part !== null,
    )
    return parts.length > 0 ? parts.join(', ') : null
  }
  return stringOrNull(doc.countryName)
}

/**
 * Build a placement-resolved public view of a Location. The `coverImage`
 * comes back as a `PublicImage` (URL, alt, dimensions, status) chosen by the
 * media resolver — callers render it dumbly.
 *
 * Per ADR 0002: SSR pages must consume views, not raw Payload docs.
 */
export const buildPublicLocationView = (
  doc: LocationDocLike,
  options: BuildPublicLocationViewOptions,
): PublicLocationView => {
  const id = numericIdOrNull(doc.id)
  const level = levelOrNull(doc.level)
  const coverImage = resolveMediaSetForPlacement(
    isRecord(doc.coverImage) ? doc.coverImage : null,
    options.placement,
    { allowMigrationFallback: options.allowMigrationFallback ?? true },
  )

  return {
    id,
    level,
    locationKey: stringOrNull(doc.locationKey),
    parentKey: stringOrNull(doc.parentKey),
    countryName: stringOrNull(doc.countryName),
    cityName: stringOrNull(doc.cityName),
    neighborhoodName: stringOrNull(doc.neighborhoodName),
    title: buildTitle(doc, id),
    subtitle: buildSubtitle(doc, level),
    coverImage,
    updatedAt: stringOrNull(doc.updatedAt),
  }
}
