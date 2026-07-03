import type { LocationDoc } from './types'
import { parseLocationKey } from './keys'

export const getLocationLevel = (
  location: Pick<LocationDoc, 'locationKey' | 'level'> | null | undefined,
): LocationDoc['level'] => {
  if (location?.level) return location.level

  const parts = parseLocationKey(location?.locationKey || '')
  if (parts.length >= 3) return 'neighborhood'
  if (parts.length === 2) return 'city'
  if (parts.length === 1) return 'country'
  return undefined
}

export const isCityLocation = (location: Pick<LocationDoc, 'locationKey' | 'level'> | null | undefined): boolean =>
  getLocationLevel(location) === 'city'
