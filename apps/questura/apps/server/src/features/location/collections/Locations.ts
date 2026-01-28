/**
 * Locations Collection
 *
 * Managed by admins via the API or admin UI.
 */

import type { CollectionConfig, Payload } from 'payload'
import { findLocationReferences } from '@/shared/location/server/references'

type LocationLevel = 'country' | 'city' | 'neighborhood'

type LocationInput = {
  level?: LocationLevel
  country?: string | null
  city?: string | null
  neighborhood?: string | null
  countryName?: string | null
  cityName?: string | null
  neighborhoodName?: string | null
  parentKey?: string | null
}

const levelOptions = [
  { label: 'Country', value: 'country' },
  { label: 'City', value: 'city' },
  { label: 'Neighborhood', value: 'neighborhood' },
]

const isLocationLevel = (value: unknown): value is LocationLevel =>
  value === 'country' || value === 'city' || value === 'neighborhood'

const normalizeKeyPart = (value: unknown): string => {
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

const normalizeDisplayName = (value: unknown): string => {
  if (typeof value !== 'string') return ''

  return value.trim()
}

const formatFallbackName = (value: string): string => {
  if (!value) return ''

  return value
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const parseLocationKey = (locationKey: string) => {
  const parts = locationKey.split('|')
  if (parts.length < 1 || parts.length > 3) {
    throw new Error('locationKey must have 1-3 pipe-delimited segments')
  }

  const [country, city, neighborhood] = parts
  return { country, city, neighborhood }
}

const resolveLevelFromKey = (
  parts: ReturnType<typeof parseLocationKey>
): LocationLevel => {
  if (parts.neighborhood) return 'neighborhood'
  if (parts.city) return 'city'
  return 'country'
}

const buildKeyData = (
  level: LocationLevel,
  parts: { country: string; city?: string; neighborhood?: string }
) => {
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

  return result.docs?.[0] ?? null
}

const createLocationIfMissing = async (
  payload: Payload,
  locationKey: string,
  data: LocationInput
) => {
  const existing = await findLocationByKey(payload, locationKey)
  if (existing) return existing

  return payload.create({
    collection: 'locations',
    data,
    overrideAccess: true,
  })
}

const ensureParentLocations = async (payload: Payload, data: LocationInput) => {
  if (!data.country) return

  await createLocationIfMissing(payload, data.country, {
    level: 'country',
    country: data.country,
    countryName: data.countryName ?? null,
  })

  if (data.level === 'neighborhood' && data.city) {
    await createLocationIfMissing(payload, `${data.country}|${data.city}`, {
      level: 'city',
      country: data.country,
      city: data.city,
      countryName: data.countryName ?? null,
      cityName: data.cityName ?? null,
    })
  }
}

export const Locations: CollectionConfig = {
  slug: 'locations',
  labels: {
    singular: 'Location',
    plural: 'Locations',
  },
  admin: {
    useAsTitle: 'locationKey',
    defaultColumns: ['level', 'countryName', 'cityName', 'neighborhoodName'],
    group: 'Tags',
    description: 'Locations are managed by admins via the API or admin UI.',
  },

  access: {
    read: () => true,
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },

  fields: [
    {
      name: 'level',
      type: 'select',
      options: levelOptions,
      required: true,
      admin: {
        description: 'Hierarchy level for this location entry.',
      },
    },
    {
      name: 'country',
      type: 'text',
      required: true,
      admin: {
        description: 'Normalized key segment (e.g., "colombia").',
      },
    },

    {
      name: 'city',
      type: 'text',
      required: false,
      admin: {
        condition: (data) => data?.level === 'city' || data?.level === 'neighborhood',
        description: 'Normalized key segment (e.g., "bogota").',
      },
    },

    {
      name: 'neighborhood',
      type: 'text',
      admin: {
        condition: (data) => data?.level === 'neighborhood',
        description: 'Normalized key segment (e.g., "santa-teresita").',
      },
    },

    {
      name: 'locationKey',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Canonical key derived from the normalized segments.',
      },
    },

    {
      name: 'parentKey',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Location key of the direct parent (null for countries).',
      },
    },

    {
      name: 'countryName',
      type: 'text',
      required: true,
      admin: {
        description: 'Display name for UI (e.g., "Colombia").',
      },
    },

    {
      name: 'cityName',
      type: 'text',
      admin: {
        condition: (data) => data?.level === 'city' || data?.level === 'neighborhood',
        description: 'Display name for UI (e.g., "Bogota").',
      },
    },

    {
      name: 'neighborhoodName',
      type: 'text',
      admin: {
        condition: (data) => data?.level === 'neighborhood',
        description: 'Display name for UI (e.g., "Santa Teresita").',
      },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc }) => {
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
            data.country ?? originalDoc?.country ?? keyParts.country
          )
          const normalizedCountryExisting = normalizeKeyPart(keyParts.country)

          if (normalizedCountryInput && normalizedCountryInput !== normalizedCountryExisting) {
            throw new Error('country cannot change after locationKey is created')
          }

          if (level !== 'country') {
            const normalizedCityInput = normalizeKeyPart(
              data.city ?? originalDoc?.city ?? keyParts.city
            )
            const normalizedCityExisting = normalizeKeyPart(keyParts.city)

            if (normalizedCityInput && normalizedCityInput !== normalizedCityExisting) {
              throw new Error('city cannot change after locationKey is created')
            }
          }

          if (level === 'neighborhood') {
            const normalizedNeighborhoodInput = normalizeKeyPart(
              data.neighborhood ?? originalDoc?.neighborhood ?? keyParts.neighborhood
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

        const countryNameRaw = normalizeDisplayName(
          data.countryName ?? originalDoc?.countryName
        )
        const cityNameRaw = normalizeDisplayName(data.cityName ?? originalDoc?.cityName)
        const neighborhoodNameRaw = normalizeDisplayName(
          data.neighborhoodName ?? originalDoc?.neighborhoodName
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
      },
    ],
    beforeChange: [
      async ({ data, req, operation }) => {
        if (!data?.parentKey) return data

        const locationData = data as LocationInput
        let parent = await findLocationByKey(req.payload, data.parentKey)

        if (!parent && operation === 'create') {
          await ensureParentLocations(req.payload, locationData)
          parent = await findLocationByKey(req.payload, data.parentKey)
        }

        if (!parent) {
          throw new Error(`parentKey does not reference an existing location: ${data.parentKey}`)
        }

        return data
      },
    ],
    beforeDelete: [
      async ({ req, id, doc }) => {
        const location =
          doc ??
          (id
            ? await req.payload.findByID({
                collection: 'locations',
                id,
                depth: 0,
                overrideAccess: true,
              })
            : null)

        const locationKey = location?.locationKey
        if (!locationKey) return

        const children = await req.payload.find({
          collection: 'locations',
          where: {
            parentKey: {
              equals: locationKey,
            },
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })

        if (children.totalDocs > 0) {
          throw new Error(
            `Cannot delete location "${locationKey}" because it has child locations.`
          )
        }

        const references = await findLocationReferences(req.payload, locationKey, location?.id)

        if (references.length > 0) {
          throw new Error(
            `Cannot delete location "${locationKey}" because it is referenced by: ${references.join(
              ', '
            )}`
          )
        }
      },
    ],
  },
}
