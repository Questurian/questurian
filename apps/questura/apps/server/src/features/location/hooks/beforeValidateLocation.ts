import type { CollectionBeforeValidateHook } from 'payload'
import {
  buildKeyData,
  formatFallbackName,
  isLocationLevel,
  normalizeDisplayName,
  normalizeKeyPart,
  parseLocationKey,
  resolveLevelFromKey,
} from '../lib/location-key'

export const beforeValidateLocation: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
}) => {
  if (!data) return data

  const existingKey = originalDoc?.locationKey
  const levelInput = data.level ?? originalDoc?.level
  const level =
    (isLocationLevel(levelInput) && levelInput) ||
    (existingKey ? resolveLevelFromKey(parseLocationKey(existingKey)) : null)

  if (!level) {
    throw new Error('level is required and must be country, city, or neighborhood')
  }

  if (existingKey) {
    const keyParts = parseLocationKey(existingKey)
    const inferredLevel = resolveLevelFromKey(keyParts)

    if (level !== inferredLevel) {
      throw new Error('level does not match existing locationKey')
    }

    if (data.locationKey && data.locationKey !== existingKey) {
      throw new Error('locationKey is immutable once created')
    }

    const normalizedCountryInput = normalizeKeyPart(
      data.country ?? originalDoc?.country ?? keyParts.country,
    )
    const normalizedCountryExisting = normalizeKeyPart(keyParts.country)

    if (normalizedCountryInput && normalizedCountryInput !== normalizedCountryExisting) {
      throw new Error('country cannot change after locationKey is created')
    }

    if (level !== 'country') {
      const normalizedCityInput = normalizeKeyPart(data.city ?? originalDoc?.city ?? keyParts.city)
      const normalizedCityExisting = normalizeKeyPart(keyParts.city)

      if (normalizedCityInput && normalizedCityInput !== normalizedCityExisting) {
        throw new Error('city cannot change after locationKey is created')
      }
    }

    if (level === 'neighborhood') {
      const normalizedNeighborhoodInput = normalizeKeyPart(
        data.neighborhood ?? originalDoc?.neighborhood ?? keyParts.neighborhood,
      )
      const normalizedNeighborhoodExisting = normalizeKeyPart(keyParts.neighborhood)

      if (
        normalizedNeighborhoodInput &&
        normalizedNeighborhoodInput !== normalizedNeighborhoodExisting
      ) {
        throw new Error('neighborhood cannot change after locationKey is created')
      }
    }

    const keyData = buildKeyData(level, keyParts)
    data.level = level
    data.locationKey = existingKey
    data.parentKey = keyData.parentKey
    data.country = keyData.country
    data.city = keyData.city
    data.neighborhood = keyData.neighborhood
  } else {
    const normalizedParts = {
      country: normalizeKeyPart(data.country),
      city: normalizeKeyPart(data.city),
      neighborhood: normalizeKeyPart(data.neighborhood),
    }

    const keyData = buildKeyData(level, normalizedParts)

    if (data.locationKey && data.locationKey !== keyData.locationKey) {
      throw new Error('locationKey must match the normalized key parts')
    }

    data.level = level
    data.locationKey = keyData.locationKey
    data.parentKey = keyData.parentKey
    data.country = keyData.country
    data.city = keyData.city
    data.neighborhood = keyData.neighborhood
  }

  const countryNameRaw = normalizeDisplayName(data.countryName ?? originalDoc?.countryName)
  const cityNameRaw = normalizeDisplayName(data.cityName ?? originalDoc?.cityName)
  const neighborhoodNameRaw = normalizeDisplayName(
    data.neighborhoodName ?? originalDoc?.neighborhoodName,
  )

  const countryFallback = formatFallbackName(String(data.country || ''))
  const cityFallback = formatFallbackName(String(data.city || ''))
  const neighborhoodFallback = formatFallbackName(String(data.neighborhood || ''))

  const countryName = countryNameRaw || countryFallback
  const cityName = cityNameRaw || cityFallback
  const neighborhoodName = neighborhoodNameRaw || neighborhoodFallback

  if (!countryName) {
    throw new Error('countryName is required')
  }

  if (level !== 'country' && !cityName) {
    throw new Error('cityName is required for city and neighborhood levels')
  }

  if (level === 'neighborhood' && !neighborhoodName) {
    throw new Error('neighborhoodName is required for neighborhood level')
  }

  data.countryName = countryName
  data.cityName = level === 'country' ? null : cityName
  data.neighborhoodName = level === 'neighborhood' ? neighborhoodName : null

  return data
}
