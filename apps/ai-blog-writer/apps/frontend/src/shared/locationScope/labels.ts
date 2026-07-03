import type { LocationDoc } from './types'
import { parseLocationKey } from './keys'

function formatLocationToken(token: string): string {
  return token
    .trim()
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export function formatLocationLabel(location: Pick<LocationDoc, 'locationKey' | 'country' | 'city' | 'neighborhood'>): string {
  const partsFromFields = [
    location.country,
    location.city || undefined,
    location.neighborhood || undefined,
  ]
    .map((part) => (part || '').trim())
    .filter(Boolean)

  if (partsFromFields.length > 0) {
    return partsFromFields.map((part) => formatLocationToken(part)).join(' > ')
  }

  const partsFromKey = parseLocationKey(location.locationKey || '')
  if (partsFromKey.length > 0) {
    return partsFromKey.map((part) => formatLocationToken(part)).join(' > ')
  }

  return location.locationKey || ''
}
