import type { CollectionBeforeValidateHook, Payload } from 'payload'
import { locationIdentitySelect } from '../constants'
import type { LocationOption } from '../types'
import { getLocationScope, normalizeLocationKey, parseLocationKey } from './locationScope'

type ArticleLocationScope = {
  exactNeighborhoods: boolean
  keys: string[]
  refs: Array<string | number>
}

type SharedNeighborhoodValidationInput = {
  location?: unknown
  sharedNeighborhoods?: unknown
}

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const extractRelationshipIds = (value: unknown): Array<string | number> => {
  const rawValues = Array.isArray(value) ? value : value ? [value] : []
  const seen = new Set<string>()

  return rawValues.flatMap((item) => {
    let id: string | number | null = null

    if (typeof item === 'string' || typeof item === 'number') {
      id = item
    } else if (typeof item === 'object' && item !== null && 'id' in item) {
      const rawId = (item as { id?: unknown }).id
      if (typeof rawId === 'string' || typeof rawId === 'number') {
        id = rawId
      }
    }

    if (id === null) return []

    const key = String(id)
    if (seen.has(key)) return []
    seen.add(key)

    return [id]
  })
}

const findLocationsByIds = async (
  payload: Payload,
  ids: Array<string | number>,
): Promise<LocationOption[]> => {
  if (!ids.length) return []

  const result = await payload.find({
    collection: 'locations',
    where: {
      id: {
        in: ids,
      },
    },
    limit: ids.length,
    depth: 0,
    overrideAccess: true,
    select: locationIdentitySelect,
  })

  const docs = (result.docs || []) as LocationOption[]
  const byId = new Map(docs.map((doc) => [String(doc.id), doc]))

  return ids
    .map((id) => byId.get(String(id)))
    .filter((doc): doc is LocationOption => Boolean(doc))
}

const isCityLocationKey = (locationKey: unknown): locationKey is string =>
  typeof locationKey === 'string' && parseLocationKey(locationKey).length === 2

export const validateSharedNeighborhoodSelection = async (
  payload: Payload,
  input: SharedNeighborhoodValidationInput,
): Promise<true | string> => {
  const locationKey = typeof input.location === 'string' ? normalizeLocationKey(input.location) : ''
  const ids = extractRelationshipIds(input.sharedNeighborhoods)

  if (!ids.length) return true
  if (!isCityLocationKey(locationKey)) {
    return 'Shared neighborhoods require a city-level primary location.'
  }

  const locations = await findLocationsByIds(payload, ids)
  if (locations.length !== ids.length) {
    return 'Shared neighborhoods must reference existing locations.'
  }

  for (const location of locations) {
    if (location.level !== 'neighborhood') {
      return 'Shared neighborhoods must reference neighborhood-level locations.'
    }

    if (normalizeLocationKey(location.parentKey || '') !== locationKey) {
      return 'Shared neighborhoods must all belong to the selected city.'
    }
  }

  return true
}

export const getArticleLocationScope = async (
  payload: Payload,
  input: SharedNeighborhoodValidationInput,
): Promise<ArticleLocationScope> => {
  const locationKey = typeof input.location === 'string' ? normalizeLocationKey(input.location) : ''
  const sharedNeighborhoodIds = extractRelationshipIds(input.sharedNeighborhoods)

  if (sharedNeighborhoodIds.length) {
    const neighborhoods = await findLocationsByIds(payload, sharedNeighborhoodIds)
    const keys = neighborhoods
      .map((location) => normalizeLocationKey(location.locationKey || ''))
      .filter(Boolean)

    const refs = neighborhoods
      .map((location) => location.id)
      .filter((id): id is string | number => id !== undefined && id !== null)

    return {
      exactNeighborhoods: true,
      keys,
      refs,
    }
  }

  if (!locationKey) {
    return {
      exactNeighborhoods: false,
      keys: [],
      refs: [],
    }
  }

  const scope = await getLocationScope(payload, locationKey)

  return {
    exactNeighborhoods: false,
    keys: scope.keys.map((key) => normalizeLocationKey(key)).filter(Boolean),
    refs: scope.refs,
  }
}

export const isLocationWithinArticleScope = (
  itemLocationKey: string,
  scope: ArticleLocationScope,
): boolean => {
  const normalizedLocation = normalizeLocationKey(itemLocationKey)
  if (!normalizedLocation) return false
  return scope.keys.includes(normalizedLocation)
}

export const syncSharedNeighborhoodsField = (
  fieldName = 'sharedNeighborhoods',
): CollectionBeforeValidateHook => {
  return async ({ data, originalDoc }) => {
    if (!data) return data

    const mutableData = data as Record<string, unknown>
    const original = originalDoc as Record<string, unknown> | undefined

    const sharedNeighborhoodsChanged = hasOwn(mutableData, fieldName)
    const locationChanged = hasOwn(mutableData, 'location') || hasOwn(mutableData, 'locationRef')
    const rawSelection = sharedNeighborhoodsChanged ? mutableData[fieldName] : original?.[fieldName]
    const selectionIds = extractRelationshipIds(rawSelection)

    if (!selectionIds.length) {
      if (sharedNeighborhoodsChanged) {
        mutableData[fieldName] = []
      }
      return data
    }

    const locationKey = typeof (hasOwn(mutableData, 'location') ? mutableData.location : original?.location) === 'string'
      ? normalizeLocationKey(
          String(hasOwn(mutableData, 'location') ? mutableData.location : original?.location || ''),
        )
      : ''

    if (locationChanged && !sharedNeighborhoodsChanged && !isCityLocationKey(locationKey)) {
      mutableData[fieldName] = []
      return data
    }

    if (sharedNeighborhoodsChanged) {
      mutableData[fieldName] = selectionIds
    }

    return data
  }
}
