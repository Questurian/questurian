import type { Payload, Where } from 'payload'

const normalizeSegment = (segment: string): string => segment.trim().toLowerCase()

export const normalizeLocationKey = (locationKey: string): string =>
  locationKey
    .trim()
    .toLowerCase()
    .split('|')
    .map(normalizeSegment)
    .filter(Boolean)
    .join('|')

export const parseLocationKey = (locationKey: string): string[] => {
  const normalized = normalizeLocationKey(locationKey)
  if (!normalized) return []
  return normalized.split('|')
}

const getEffectiveScopeParts = (locationKey: string): string[] => {
  const parts = parseLocationKey(locationKey)

  // Neighborhood-selected listicles should behave as city scope.
  if (parts.length >= 3) {
    return parts.slice(0, 2)
  }

  return parts
}

export const isLocationWithinScope = (
  itemLocationKey: string,
  selectedLocationKey: string,
): boolean => {
  const itemParts = parseLocationKey(itemLocationKey)
  const selectedParts = getEffectiveScopeParts(selectedLocationKey)

  if (!itemParts.length || !selectedParts.length) return false
  if (selectedParts.length > itemParts.length) return false

  for (let i = 0; i < selectedParts.length; i++) {
    if (itemParts[i] !== selectedParts[i]) {
      return false
    }
  }

  return true
}

type LocationScope = {
  keys: string[]
  refs: Array<string | number>
}

const getScopeWhere = (parentLocation: string): Where | null => {
  const parts = getEffectiveScopeParts(parentLocation)

  if (parts.length === 1) {
    return {
      country: { equals: parts[0] },
    }
  }

  if (parts.length === 2) {
    return {
      and: [{ country: { equals: parts[0] } }, { city: { equals: parts[1] } }],
    }
  }

  return null
}

export const getLocationScope = async (
  payload: Payload,
  parentLocation: string,
): Promise<LocationScope> => {
  const normalizedParent = normalizeLocationKey(parentLocation)
  const effectiveParts = getEffectiveScopeParts(normalizedParent)
  const effectiveLocation = effectiveParts.join('|')
  const where = getScopeWhere(effectiveLocation)

  if (!where) {
    return {
      keys: effectiveLocation ? [effectiveLocation] : [],
      refs: [],
    }
  }

  const limit = 500
  let page = 1
  let totalPages = 1
  const keys = new Set<string>()
  const refs = new Set<string | number>()

  while (page <= totalPages) {
    const result = await payload.find({
      collection: 'locations',
      where,
      limit,
      page,
      depth: 0,
      overrideAccess: true,
      select: {
        id: true,
        locationKey: true,
      },
    })

    for (const doc of result.docs as Array<{ id?: string | number; locationKey?: string }>) {
      if (doc.locationKey) keys.add(doc.locationKey)
      if (doc.id !== undefined && doc.id !== null) refs.add(doc.id)
    }

    totalPages = result.totalPages || 1
    page += 1
  }

  if (!keys.size && effectiveLocation) {
    keys.add(effectiveLocation)
  }

  return {
    keys: Array.from(keys),
    refs: Array.from(refs),
  }
}
