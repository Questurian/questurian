import type { CollectionBeforeValidateHook, Payload } from 'payload'
import type { LocationOption } from '../types'

type LocationSyncOptions = {
  locationField?: string
  locationRefField?: string
}

const extractRelationshipId = (value: unknown): string | number | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const idValue = (value as { id?: unknown }).id
    if (typeof idValue === 'string' || typeof idValue === 'number') {
      return idValue
    }
  }
  return null
}

const findLocationByKey = async (payload: Payload, locationKey: string) => {
  const result = await payload.find({
    collection: 'locations',
    where: {
      locationKey: {
        equals: locationKey,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  return (result.docs?.[0] as LocationOption | undefined) ?? null
}

const findLocationById = async (payload: Payload, id: string | number) => {
  const result = await payload.findByID({
    collection: 'locations',
    id,
    depth: 0,
    overrideAccess: true,
  })

  return (result as LocationOption | undefined) ?? null
}

export const syncLocationFields = (
  options: LocationSyncOptions = {}
): CollectionBeforeValidateHook => {
  const locationField = options.locationField ?? 'location'
  const locationRefField = options.locationRefField ?? 'locationRef'

  return async ({ data, originalDoc, req }) => {
    if (!data) return data

    const mutableData = data as Record<string, unknown>
    const original = originalDoc as Record<string, unknown> | undefined

    const hasLocation = Object.prototype.hasOwnProperty.call(mutableData, locationField)
    const hasLocationRef = Object.prototype.hasOwnProperty.call(mutableData, locationRefField)

    const rawLocationValue = hasLocation ? mutableData[locationField] : original?.[locationField]

    if (
      hasLocation &&
      rawLocationValue !== null &&
      rawLocationValue !== undefined &&
      typeof rawLocationValue !== 'string'
    ) {
      throw new Error('location must be a locationKey string')
    }

    const locationKey = typeof rawLocationValue === 'string' ? rawLocationValue.trim() : ''

    // Extract locationRef BEFORE deciding whether to clear fields
    const rawLocationRefValue = hasLocationRef
      ? mutableData[locationRefField]
      : original?.[locationRefField]
    const locationRefId = extractRelationshipId(rawLocationRefValue)

    // Only clear both fields if location is empty AND locationRef is also empty
    // This allows partial updates where only locationRef is provided
    if (hasLocation && !locationKey && !locationRefId) {
      mutableData[locationField] = null
      mutableData[locationRefField] = null
      return data
    }

    if (locationKey) {
      const location = await findLocationByKey(req.payload, locationKey)

      if (!location?.id) {
        throw new Error(`location does not exist for key: ${locationKey}`)
      }

      if (locationRefId !== null && String(locationRefId) !== String(location.id)) {
        throw new Error('location and locationRef do not match')
      }

      mutableData[locationField] = location.locationKey
      mutableData[locationRefField] = location.id

      return data
    }

    if (locationRefId !== null) {
      const location = await findLocationById(req.payload, locationRefId)

      if (!location?.locationKey) {
        throw new Error('locationRef does not reference an existing location')
      }

      mutableData[locationField] = location.locationKey
      mutableData[locationRefField] = location.id
    }

    return data
  }
}
