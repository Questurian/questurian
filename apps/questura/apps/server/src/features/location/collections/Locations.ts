/**
 * Locations Collection
 *
 * Managed by admins via the API or admin UI.
 */

import type { CollectionAfterReadHook, CollectionConfig, Payload } from 'payload'
import { locationIdentitySelect } from '@/shared/location/constants'
import { findLocationReferences } from '@/shared/location/server/references'
import {
  validateCountrySlugAgainstReserved,
  validateSlugAgainstReserved,
} from '@/shared/lib/reservedSlugs'
import { validateLocationSlugAgainstCategories } from '@/shared/lib/categoryLocationCollision'
import {
  LOCATION_GUIDE_CONTRACT,
  type LocationLevel,
} from '@/shared/lib/locationGuideContract'
import {
  attachResolvedCurrencyMeta,
  extractResolvedCurrencyId,
  hasMeaningfulLocationGuideValue,
  resolveLocationGuideForHierarchy,
  type LocationGuideRecord,
  type ResolvedCurrencyMeta,
} from '@/shared/lib/locationGuideResolution'
import { buildGuideField } from './guideFields'

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

type LocationReadDoc = {
  id?: string | number
  level?: LocationLevel
  locationKey?: string | null
  parentKey?: string | null
  guide?: LocationGuideRecord | null
}

const LOCATION_GUIDE_RESOLVE_CONTEXT_KEY = 'skipLocationGuideResolve'
const LOCATION_GUIDE_CURRENCY_META_CACHE_KEY = 'locationGuideCurrencyMetaCache'

type CurrencyMetaDoc = {
  id: number
  code?: string | null
  name?: string | null
  symbol?: string | null
  displaySymbol?: string | null
  defaultLocale?: string | null
  decimalPlaces?: number | null
  latestUsdRate?: {
    unitsPerUsd?: number | null
    provider?: string | null
    sourceUpdatedAt?: string | null
    nextUpdateAt?: string | null
    fetchedAt?: string | null
  } | null
}

const levelOptions = [
  { label: 'Country', value: 'country' },
  { label: 'City', value: 'city' },
  { label: 'Neighborhood', value: 'neighborhood' },
]

const countryGuideSectionKeys = new Set(
  LOCATION_GUIDE_CONTRACT.sectionPathsByLevel.country
    .filter((path) => path.startsWith('guide.'))
    .map((path) => path.replace(/^guide\./, ''))
    .filter((key) => key !== 'media'),
)

const localGuideSectionKeys = new Set(
  LOCATION_GUIDE_CONTRACT.sectionPathsByLevel.city
    .filter((path) => path.startsWith('guide.'))
    .map((path) => path.replace(/^guide\./, ''))
    .filter((key) => key !== 'media'),
)

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

const stripHighlightNeighborhoodReferences = (value: unknown): void => {
  if (!value || typeof value !== 'object') return

  const highlights = (value as { highlights?: unknown }).highlights
  if (!Array.isArray(highlights)) return

  for (const highlight of highlights) {
    if (highlight && typeof highlight === 'object' && 'relatedNeighborhoods' in highlight) {
      delete (highlight as Record<string, unknown>).relatedNeighborhoods
    }
  }
}

const stripNeighborhoodGuideRelationships = (guide: unknown): void => {
  if (!guide || typeof guide !== 'object') return

  const guideRecord = guide as Record<string, unknown>
  stripHighlightNeighborhoodReferences(guideRecord.explore)
  stripHighlightNeighborhoodReferences(guideRecord.stay)
  stripHighlightNeighborhoodReferences(guideRecord.move)
}

const stripNeighborhoodGuideFields = (guide: unknown): void => {
  if (!guide || typeof guide !== 'object') return

  const guideRecord = guide as Record<string, unknown>
  const core = guideRecord.core
  if (core && typeof core === 'object') {
    delete (core as Record<string, unknown>).timezone
    delete (core as Record<string, unknown>).healthSafety
    delete (core as Record<string, unknown>).moneyHandling
    delete (core as Record<string, unknown>).weather
  }

  const explore = guideRecord.explore
  if (explore && typeof explore === 'object') {
    delete (explore as Record<string, unknown>).touristVisaStatus
    delete (explore as Record<string, unknown>).touristVisaNotes
    delete (explore as Record<string, unknown>).exchangeRateInfo
    delete (explore as Record<string, unknown>).costOfLivingSummary
  }

  const stay = guideRecord.stay
  if (stay && typeof stay === 'object') {
    delete (stay as Record<string, unknown>).touristVisaDuration
    delete (stay as Record<string, unknown>).touristVisaExtensionNotes
    delete (stay as Record<string, unknown>).timezoneOverlapNote
  }

  const move = guideRecord.move
  if (move && typeof move === 'object') {
    delete (move as Record<string, unknown>).residencyVisa
    delete (move as Record<string, unknown>).residencyNotes
    delete (move as Record<string, unknown>).processingTime
    delete (move as Record<string, unknown>).incomeRequirements
    delete (move as Record<string, unknown>).safestDistricts
    delete (move as Record<string, unknown>).workPermits
  }

  stripNeighborhoodGuideRelationships(guide)
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
  parts: ReturnType<typeof parseLocationKey>,
): LocationLevel => {
  if (parts.neighborhood) return 'neighborhood'
  if (parts.city) return 'city'
  return 'country'
}

const buildKeyData = (
  level: LocationLevel,
  parts: { country: string; city?: string; neighborhood?: string },
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
    select: locationIdentitySelect,
  })

  return result.docs?.[0] ?? null
}

const buildGuideResolveContext = (context?: Record<string, unknown>) => ({
  ...(context ?? {}),
  [LOCATION_GUIDE_RESOLVE_CONTEXT_KEY]: true,
})

const findLocationGuideByKey = async (
  payload: Payload,
  locationKey: string,
  context?: Record<string, unknown>,
): Promise<LocationReadDoc | null> => {
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
    context: buildGuideResolveContext(context),
  } as any)

  return (result.docs?.[0] as LocationReadDoc | undefined) ?? null
}

const findCurrencyMetaById = async (
  payload: Payload,
  currencyId: number,
  context?: Record<string, unknown>,
): Promise<ResolvedCurrencyMeta | null> => {
  const currencyMetaCache = (
    context?.[LOCATION_GUIDE_CURRENCY_META_CACHE_KEY] as Map<number, ResolvedCurrencyMeta | null> | undefined
  ) ?? new Map<number, ResolvedCurrencyMeta | null>()

  if (context && !context[LOCATION_GUIDE_CURRENCY_META_CACHE_KEY]) {
    context[LOCATION_GUIDE_CURRENCY_META_CACHE_KEY] = currencyMetaCache
  }

  if (currencyMetaCache.has(currencyId)) {
    return currencyMetaCache.get(currencyId) ?? null
  }

  const currencyDoc = await payload.findByID({
    collection: 'currencies',
    id: currencyId,
    depth: 0,
    overrideAccess: true,
    select: {
      id: true,
      code: true,
      name: true,
      symbol: true,
      displaySymbol: true,
      defaultLocale: true,
      decimalPlaces: true,
      latestUsdRate: true,
    },
  } as any).catch(() => null)

  const doc = currencyDoc as CurrencyMetaDoc | null
  if (!doc || typeof doc.id !== 'number' || !doc.code || !doc.name) {
    currencyMetaCache.set(currencyId, null)
    return null
  }

  const resolvedMeta: ResolvedCurrencyMeta = {
    id: doc.id,
    code: doc.code,
    name: doc.name,
    symbol: doc.symbol ?? '',
    displaySymbol: doc.displaySymbol ?? doc.symbol ?? doc.code,
    defaultLocale: doc.defaultLocale ?? 'en-US',
    decimalPlaces: typeof doc.decimalPlaces === 'number' ? doc.decimalPlaces : 2,
    latestUsdRate: doc.latestUsdRate && typeof doc.latestUsdRate === 'object'
      ? {
          unitsPerUsd: typeof doc.latestUsdRate.unitsPerUsd === 'number'
            ? doc.latestUsdRate.unitsPerUsd
            : null,
          provider: typeof doc.latestUsdRate.provider === 'string'
            ? doc.latestUsdRate.provider
            : null,
          sourceUpdatedAt: typeof doc.latestUsdRate.sourceUpdatedAt === 'string'
            ? doc.latestUsdRate.sourceUpdatedAt
            : null,
          nextUpdateAt: typeof doc.latestUsdRate.nextUpdateAt === 'string'
            ? doc.latestUsdRate.nextUpdateAt
            : null,
          fetchedAt: typeof doc.latestUsdRate.fetchedAt === 'string'
            ? doc.latestUsdRate.fetchedAt
            : null,
        }
      : null,
  }

  currencyMetaCache.set(currencyId, resolvedMeta)
  return resolvedMeta
}

const createLocationIfMissing = async (
  payload: Payload,
  locationKey: string,
  data: LocationInput,
) => {
  const existing = await findLocationByKey(payload, locationKey)
  if (existing) return existing

  const normalizedData = {
    ...data,
    country: data.country ?? undefined,
    city: data.city ?? undefined,
    neighborhood: data.neighborhood ?? undefined,
    countryName: data.countryName ?? undefined,
    cityName: data.cityName ?? undefined,
    neighborhoodName: data.neighborhoodName ?? undefined,
    parentKey: data.parentKey ?? undefined,
  }

  return payload.create({
    collection: 'locations',
    data: normalizedData as any,
    draft: false,
    overrideAccess: true,
  } as any)
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

const resolveLocationReadGuide = async (
  payload: Payload,
  doc: LocationReadDoc,
  context?: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  if (!doc.level || !doc.locationKey) return {}

  if (doc.level === 'country') {
    return resolveLocationGuideForHierarchy({
      level: 'country',
      ownGuide: doc.guide,
    })
  }

  const keyParts = parseLocationKey(doc.locationKey)
  const countryDoc = await findLocationGuideByKey(payload, keyParts.country, context)

  if (doc.level === 'city') {
    return resolveLocationGuideForHierarchy({
      level: 'city',
      ownGuide: doc.guide,
      countryGuide: countryDoc?.guide,
    })
  }

  const cityKey = `${keyParts.country}|${keyParts.city}`
  const cityDoc = await findLocationGuideByKey(payload, cityKey, context)

  return resolveLocationGuideForHierarchy({
    level: 'neighborhood',
    ownGuide: doc.guide,
    countryGuide: countryDoc?.guide,
    cityGuide: cityDoc?.guide,
  })
}

const afterReadResolveGuideHook: CollectionAfterReadHook = async ({ doc, req }) => {
  if (!doc || !req) return doc

  const context = (req.context as Record<string, unknown> | undefined) ?? {}
  if (context[LOCATION_GUIDE_RESOLVE_CONTEXT_KEY] === true) return doc
  if (!('guide' in doc)) return doc

  const locationDoc = doc as LocationReadDoc & Record<string, unknown>
  if (!isLocationLevel(locationDoc.level)) return doc

  const resolvedGuide = await resolveLocationReadGuide(req.payload, locationDoc, context)
  const resolvedCurrencyId = extractResolvedCurrencyId(resolvedGuide)
  const resolvedCurrencyMeta = resolvedCurrencyId === null
    ? null
    : await findCurrencyMetaById(req.payload, resolvedCurrencyId, context)
  const enrichedGuide = attachResolvedCurrencyMeta(resolvedGuide, resolvedCurrencyMeta)

  if (hasMeaningfulLocationGuideValue(enrichedGuide)) {
    locationDoc.resolvedGuide = enrichedGuide
  }

  return locationDoc
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
      validate: (async (
        value: unknown,
        options: { req?: { payload: Payload } },
      ) => {
        const reserved = validateCountrySlugAgainstReserved(value)
        if (reserved !== true) return reserved
        return validateLocationSlugAgainstCategories(value, options?.req)
      }) as never,
      admin: {
        description: 'Normalized key segment (e.g., "colombia").',
      },
    },
    {
      name: 'city',
      type: 'text',
      required: false,
      validate: (async (
        value: unknown,
        options: {
          data?: Record<string, unknown>
          req?: { payload: Payload }
        },
      ) => {
        const level = (options?.data as { level?: string } | undefined)?.level
        if (level !== 'city' && level !== 'neighborhood') return true
        const reserved = validateSlugAgainstReserved(value)
        if (reserved !== true) return reserved
        return validateLocationSlugAgainstCategories(value, options?.req)
      }) as never,
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
    buildGuideField(),
    {
      name: 'resolvedGuide',
      label: 'Resolved Guide',
      type: 'json',
      virtual: true,
      admin: {
        hidden: true,
        readOnly: true,
        description:
          'Computed read-only guide surface used by frontend consumers after country/city/neighborhood resolution.',
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
            data.country ?? originalDoc?.country ?? keyParts.country,
          )
          const normalizedCountryExisting = normalizeKeyPart(keyParts.country)

          if (normalizedCountryInput && normalizedCountryInput !== normalizedCountryExisting) {
            throw new Error('country cannot change after locationKey is created')
          }

          if (level !== 'country') {
            const normalizedCityInput = normalizeKeyPart(
              data.city ?? originalDoc?.city ?? keyParts.city,
            )
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

        const guide = (data.guide ?? originalDoc?.guide) as
          | (LocationGuideRecord & Record<string, unknown>)
          | undefined

        if (level === 'neighborhood' && data.guide) {
          stripNeighborhoodGuideFields(data.guide)
        }

        if (guide) {
          const hasLocalGuideData = [...localGuideSectionKeys].some((sectionKey) =>
            hasMeaningfulLocationGuideValue(guide[sectionKey]),
          )

          if (level === 'country' && hasLocalGuideData) {
            throw new Error('country locations cannot store core, explore, stay, or move guide data')
          }

          for (const sectionKey of Object.keys(guide)) {
            if (sectionKey === 'media') continue
            if (level === 'country' && countryGuideSectionKeys.has(sectionKey)) continue
            if (level !== 'country' && localGuideSectionKeys.has(sectionKey)) continue
            if (!hasMeaningfulLocationGuideValue(guide[sectionKey])) continue

            throw new Error(`guide.${sectionKey} is not valid for ${level} locations`)
          }
        }

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
    afterRead: [afterReadResolveGuideHook],
    beforeDelete: [
      async ({ req, id }) => {
        const location = id
          ? await req.payload.findByID({
              collection: 'locations',
              id,
              depth: 0,
              overrideAccess: true,
              select: {
                id: true,
                locationKey: true,
              },
            })
          : null

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
            `Cannot delete location "${locationKey}" because it has child locations.`,
          )
        }

        const references = await findLocationReferences(req.payload, locationKey, location?.id)

        if (references.length > 0) {
          throw new Error(
            `Cannot delete location "${locationKey}" because it is referenced by: ${references.join(
              ', ',
            )}`,
          )
        }
      },
    ],
  },
}
