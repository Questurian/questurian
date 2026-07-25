import {
  normalizeAbsoluteUrl,
  pickFirstText,
  toFiniteNumber,
} from './structured-data-primitives'

const PRICE_LEVEL_TO_RANGE: Record<string, string> = {
  '1': '$',
  '2': '$$',
  '3': '$$$',
  '4': '$$$$',
}

export const normalizePriceRange = (rawValue: string | undefined): string | undefined => {
  if (!rawValue) return undefined
  const trimmed = rawValue.trim()
  if (!trimmed) return undefined
  if (/^\$+$/.test(trimmed)) return trimmed
  return PRICE_LEVEL_TO_RANGE[trimmed] || trimmed
}

export function resolveEntityName(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['title'],
    ['core', 'name'],
    ['nightlifeDetails', 'core', 'name'],
  ])
}

export function resolveEntityAddress(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['address'],
    ['theDetails', 'address'],
  ])
}

export function resolveEntityWebsite(source: Record<string, unknown>): string | undefined {
  const candidate = pickFirstText(source, [
    ['website'],
    ['theDetails', 'websiteUrl'],
    ['theDetails', 'bookingUrl'],
    ['theDetails', 'googleMapsUrl'],
  ])
  return candidate ? normalizeAbsoluteUrl(candidate) : undefined
}

export function resolveEntityPhone(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['phoneNumber'],
    ['theDetails', 'phone'],
  ])
}

export function resolveEntityPriceRange(source: Record<string, unknown>): string | undefined {
  const candidate = pickFirstText(source, [
    ['priceLevel'],
    ['core', 'price'],
    ['nightlifeDetails', 'core', 'priceTier'],
    ['attractionsDetails', 'core', 'pricing'],
  ])
  return normalizePriceRange(candidate)
}

export function resolveEntityTypeLabel(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['type'],
    ['core', 'type'],
    ['core', 'clubType'],
    ['attractionsDetails', 'core', 'attractionType'],
  ])
}

export function resolveEntityGeo(source: Record<string, unknown>): Record<string, unknown> | undefined {
  const latitude = toFiniteNumber(source.latitude)
  const longitude = toFiniteNumber(source.longitude)
  if (latitude === undefined || longitude === undefined) return undefined

  return {
    '@type': 'GeoCoordinates',
    latitude,
    longitude,
  }
}
