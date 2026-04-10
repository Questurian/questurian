import type { Payload } from 'payload'

import { locationIdentitySelect } from '@/shared/location/constants'

export const LOCATION_GRID_MIN_SLOTS = 4
export const LOCATION_GRID_MAX_SLOTS = 8

export type LocationGridLevel = 'city' | 'neighborhood'

export type LocationGridScope = {
  childLevel: LocationGridLevel
  parentKey?: string | null
}

export const MAIN_LOCATION_GRID_SCOPE: LocationGridScope = {
  childLevel: 'city',
}

export type LocationGridItemRef = {
  id: number
}

export type LocationGridCandidate = LocationGridItemRef & {
  slot?: number
  level: LocationGridLevel
  locationKey: string | null
  parentKey: string | null
  countryName: string | null
  cityName: string | null
  neighborhoodName: string | null
  title: string
  subtitle: string | null
  updatedAt: string | null
}

export type LocationGridInvalidReason =
  | 'invalid_reference'
  | 'not_found'
  | 'invalid_scope'

export type LocationGridInvalidItem = {
  slot: number
  id?: number
  title?: string | null
  reason: LocationGridInvalidReason
}

export type LocationGridSelection = {
  items: LocationGridCandidate[]
  invalidItems: LocationGridInvalidItem[]
  isComplete: boolean
  totalSlots: number
}

export type LocationGridCandidatesResponse = {
  docs: LocationGridCandidate[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
}

type LocationDocLike = {
  id?: unknown
  level?: unknown
  locationKey?: unknown
  parentKey?: unknown
  countryName?: unknown
  cityName?: unknown
  neighborhoodName?: unknown
  updatedAt?: unknown
}

type ParsedLocationGridSlot = {
  slot: number
  ref: LocationGridItemRef | null
  reason: LocationGridInvalidReason | null
}

type PayloadFindWhere = NonNullable<Parameters<Payload['find']>[0]['where']>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeNumericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed)
    }
  }

  return null
}

function getLocationGridTitle(doc: LocationDocLike): string {
  if (typeof doc.neighborhoodName === 'string' && doc.neighborhoodName.trim()) {
    return doc.neighborhoodName.trim()
  }

  if (typeof doc.cityName === 'string' && doc.cityName.trim()) {
    return doc.cityName.trim()
  }

  if (typeof doc.countryName === 'string' && doc.countryName.trim()) {
    return doc.countryName.trim()
  }

  if (typeof doc.locationKey === 'string' && doc.locationKey.trim()) {
    return doc.locationKey.trim()
  }

  const id = normalizeNumericId(doc.id)
  return id ? `Location #${id}` : 'Untitled location'
}

function getLocationGridSubtitle(doc: LocationDocLike): string | null {
  if (doc.level === 'neighborhood') {
    const parts = [doc.cityName, doc.countryName]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
    return parts.length > 0 ? parts.join(', ') : null
  }

  if (typeof doc.countryName === 'string' && doc.countryName.trim()) {
    return doc.countryName.trim()
  }

  return null
}

function normalizeLocationGridCandidate(doc: LocationDocLike): LocationGridCandidate {
  return {
    id: normalizeNumericId(doc.id) ?? 0,
    level: doc.level === 'neighborhood' ? 'neighborhood' : 'city',
    locationKey:
      typeof doc.locationKey === 'string' && doc.locationKey.trim() ? doc.locationKey : null,
    parentKey:
      typeof doc.parentKey === 'string' && doc.parentKey.trim() ? doc.parentKey : null,
    countryName:
      typeof doc.countryName === 'string' && doc.countryName.trim() ? doc.countryName : null,
    cityName:
      typeof doc.cityName === 'string' && doc.cityName.trim() ? doc.cityName : null,
    neighborhoodName:
      typeof doc.neighborhoodName === 'string' && doc.neighborhoodName.trim()
        ? doc.neighborhoodName
        : null,
    title: getLocationGridTitle(doc),
    subtitle: getLocationGridSubtitle(doc),
    updatedAt:
      typeof doc.updatedAt === 'string' && doc.updatedAt.trim() ? doc.updatedAt : null,
  }
}

function isLocationWithinScope(
  candidate: Pick<LocationGridCandidate, 'level' | 'parentKey'>,
  scope: LocationGridScope | null,
): boolean {
  if (!scope) return false
  if (candidate.level !== scope.childLevel) return false

  if (scope.parentKey) {
    return candidate.parentKey === scope.parentKey
  }

  return true
}

export function resolveLocationGridScopeFromLocation(
  location: {
    level?: unknown
    locationKey?: unknown
  } | null | undefined,
): LocationGridScope | null {
  if (!location || location.level !== 'city') {
    return null
  }

  if (typeof location.locationKey !== 'string' || !location.locationKey.trim()) {
    return null
  }

  return {
    childLevel: 'neighborhood',
    parentKey: location.locationKey,
  }
}

export function normalizeLocationGridRef(value: unknown): LocationGridItemRef | null {
  const directId = normalizeNumericId(value)
  if (directId !== null) {
    return { id: directId }
  }

  if (!isRecord(value)) return null

  const nestedId = normalizeNumericId(value.id)
  if (nestedId !== null) {
    return { id: nestedId }
  }

  const nestedValue = value.value
  if (isRecord(nestedValue)) {
    const nestedValueId = normalizeNumericId(nestedValue.id)
    if (nestedValueId !== null) {
      return { id: nestedValueId }
    }
  }

  const valueId = normalizeNumericId(nestedValue)
  if (valueId !== null) {
    return { id: valueId }
  }

  return null
}

export function normalizeLocationGridInput(rawItems: unknown): LocationGridItemRef[] {
  if (!Array.isArray(rawItems)) return []

  const refs = rawItems.map((item) => normalizeLocationGridRef(item))

  if (refs.some((item) => item === null)) {
    throw new Error('Location grid items must use numeric location ids.')
  }

  return refs as LocationGridItemRef[]
}

function parseLocationGridSlots(rawItems: unknown): ParsedLocationGridSlot[] {
  if (!Array.isArray(rawItems)) return []

  return rawItems.map((rawItem, index) => {
    const ref = normalizeLocationGridRef(rawItem)

    return {
      slot: index + 1,
      ref,
      reason: ref ? null : 'invalid_reference',
    }
  })
}

export function buildLocationGridGlobalData(items: LocationGridItemRef[]) {
  return {
    items: items.map((item) => item.id),
  }
}

async function findLocationGridDoc(
  payload: Payload,
  ref: LocationGridItemRef,
): Promise<LocationGridCandidate | null> {
  try {
    const doc = await payload.findByID({
      collection: 'locations',
      id: ref.id,
      depth: 0,
      overrideAccess: true,
      select: locationIdentitySelect,
    })

    return normalizeLocationGridCandidate(doc as LocationDocLike)
  } catch {
    return null
  }
}

function getScopedLocationLabel(scope: LocationGridScope): string {
  return scope.childLevel === 'city' ? 'city' : 'neighborhood'
}

async function validateLocationGridDoc(
  payload: Payload,
  ref: LocationGridItemRef,
  scope: LocationGridScope,
): Promise<void> {
  const candidate = await findLocationGridDoc(payload, ref)

  if (!candidate) {
    throw new Error(`Location #${ref.id} could not be found.`)
  }

  if (!isLocationWithinScope(candidate, scope)) {
    throw new Error(
      `Location "${candidate.title}" is not an eligible ${getScopedLocationLabel(scope)} for this block.`,
    )
  }
}

export async function validateLocationGridItems(
  payload: Payload,
  refs: LocationGridItemRef[],
  options: {
    slotCount?: number
    scope: LocationGridScope | null
  },
): Promise<LocationGridItemRef[]> {
  const slotCount = options.slotCount ?? LOCATION_GRID_MIN_SLOTS
  const scope = options.scope

  if (!scope) {
    throw new Error(
      'Location Grid blocks are only available on the main homepage and city homepages.',
    )
  }

  if (refs.length !== slotCount) {
    throw new Error(`This block requires exactly ${slotCount} location${slotCount === 1 ? '' : 's'}.`)
  }

  const keys = new Set<string>()

  for (const ref of refs) {
    const key = String(ref.id)
    if (keys.has(key)) {
      throw new Error('Location Grid cannot contain duplicate locations.')
    }
    keys.add(key)
  }

  await Promise.all(refs.map((ref) => validateLocationGridDoc(payload, ref, scope)))

  return refs
}

export async function getLocationGridSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: {
    totalSlots?: number
    scope: LocationGridScope | null
  },
): Promise<LocationGridSelection> {
  const totalSlots = options.totalSlots ?? LOCATION_GRID_MIN_SLOTS
  const parsedSlots = parseLocationGridSlots(rawItems)
  const items: LocationGridCandidate[] = []
  const invalidItems: LocationGridInvalidItem[] = []

  for (const slot of parsedSlots) {
    if (!slot.ref) {
      invalidItems.push({
        slot: slot.slot,
        reason: slot.reason || 'invalid_reference',
      })
      continue
    }

    const candidate = await findLocationGridDoc(payload, slot.ref)

    if (!candidate) {
      invalidItems.push({
        slot: slot.slot,
        id: slot.ref.id,
        reason: 'not_found',
      })
      continue
    }

    if (!isLocationWithinScope(candidate, options.scope)) {
      invalidItems.push({
        slot: slot.slot,
        id: candidate.id,
        title: candidate.title,
        reason: 'invalid_scope',
      })
      continue
    }

    items.push({
      ...candidate,
      slot: slot.slot,
    })
  }

  return {
    items,
    invalidItems,
    isComplete:
      items.length === totalSlots
      && invalidItems.length === 0
      && parsedSlots.length === totalSlots,
    totalSlots,
  }
}

export async function searchLocationGridCandidates(
  payload: Payload,
  options: {
    query?: string
    page?: number
    limit?: number
    scope: LocationGridScope | null
  },
): Promise<LocationGridCandidatesResponse> {
  const scope = options.scope

  if (!scope) {
    throw new Error(
      'Location Grid blocks are only available on the main homepage and city homepages.',
    )
  }

  const query = options.query?.trim() || ''
  const page =
    Number.isFinite(options.page) && (options.page || 0) > 0 ? Math.trunc(options.page!) : 1
  const limit =
    Number.isFinite(options.limit) && (options.limit || 0) > 0
      ? Math.min(Math.trunc(options.limit!), 50)
      : 24

  const whereClauses: PayloadFindWhere[] = [
    {
      level: {
        equals: scope.childLevel,
      },
    },
  ]

  if (scope.parentKey) {
    whereClauses.push({
      parentKey: {
        equals: scope.parentKey,
      },
    })
  }

  if (query) {
    whereClauses.push({
      or: [
        {
          countryName: {
            like: query,
          },
        },
        {
          cityName: {
            like: query,
          },
        },
        {
          neighborhoodName: {
            like: query,
          },
        },
        {
          locationKey: {
            like: query,
          },
        },
      ],
    })
  }

  const where: PayloadFindWhere = whereClauses.length > 1
    ? { and: whereClauses }
    : whereClauses[0]

  const response = await payload.find({
    collection: 'locations',
    depth: 0,
    limit,
    page,
    sort: 'locationKey',
    where,
    overrideAccess: true,
    select: locationIdentitySelect,
  })

  const docs = (response.docs || [])
    .map((doc) => normalizeLocationGridCandidate(doc as LocationDocLike))
    .filter((candidate) => isLocationWithinScope(candidate, scope))

  return {
    docs,
    totalDocs: response.totalDocs || 0,
    totalPages: response.totalPages || Math.max(1, Math.ceil((response.totalDocs || 0) / limit)),
    page,
    limit,
  }
}
