import type { LocationLevel } from '../types'

export type LocationKeyParts = {
  country: string
  city?: string
  neighborhood?: string
}

export const isLocationLevel = (value: unknown): value is LocationLevel =>
  value === 'country' || value === 'city' || value === 'neighborhood'

export const normalizeKeyPart = (value: unknown): string => {
  if (typeof value !== 'string') return ''

  return value
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const normalizeDisplayName = (value: unknown): string => {
  if (typeof value !== 'string') return ''

  return value.trim()
}

export const formatFallbackName = (value: string): string => {
  if (!value) return ''

  return value
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export const parseLocationKey = (locationKey: string): LocationKeyParts => {
  const parts = locationKey.split('|')
  if (parts.length < 1 || parts.length > 3) {
    throw new Error('locationKey must have 1-3 pipe-delimited segments')
  }

  const [country, city, neighborhood] = parts
  return { country, city, neighborhood }
}

export const resolveLevelFromKey = (parts: LocationKeyParts): LocationLevel => {
  if (parts.neighborhood) return 'neighborhood'
  if (parts.city) return 'city'
  return 'country'
}

export const buildKeyData = (level: LocationLevel, parts: LocationKeyParts) => {
  if (!parts.country) {
    throw new Error('country is required for all location levels')
  }

  if (level === 'country') {
    return {
      country: parts.country,
      city: null,
      neighborhood: null,
      locationKey: parts.country,
      parentKey: null,
    }
  }

  if (!parts.city) {
    throw new Error('city is required for city and neighborhood levels')
  }

  if (level === 'city') {
    return {
      country: parts.country,
      city: parts.city,
      neighborhood: null,
      locationKey: `${parts.country}|${parts.city}`,
      parentKey: parts.country,
    }
  }

  if (!parts.neighborhood) {
    throw new Error('neighborhood is required for neighborhood level')
  }

  return {
    country: parts.country,
    city: parts.city,
    neighborhood: parts.neighborhood,
    locationKey: `${parts.country}|${parts.city}|${parts.neighborhood}`,
    parentKey: `${parts.country}|${parts.city}`,
  }
}
