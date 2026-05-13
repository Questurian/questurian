import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import {
  HOMEPAGE_FEATURED_CONTENT_SLOTS,
  type HomepageHotelCandidate,
  type HomepageHotelCandidatesResponse,
  type HomepageHotelInvalidItem,
  type HomepageHotelInvalidReason,
  type HomepageHotelItemRef,
  type HomepageHotelSelection,
} from './types'
import type { PayloadFindWhere } from './payload.types'

type AttractionDocLike = {
  id?: unknown
  title?: unknown
  slug?: unknown
  type?: unknown
  priceLevel?: unknown
  status?: unknown
  updatedAt?: unknown
  location?: unknown
  gallery?: unknown
}

type ParsedAttractionSlot = {
  slot: number
  ref: HomepageHotelItemRef | null
  reason: HomepageHotelInvalidReason | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeNumericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return null
}

function extractImageUrl(doc: AttractionDocLike): string | null {
  if (!Array.isArray(doc.gallery) || doc.gallery.length === 0) return null
  const first = doc.gallery[0]
  if (!isRecord(first)) return null
  const image = first.image
  if (!isRecord(image)) return null
  const bunnyUrl = image.bunny_original_url
  if (typeof bunnyUrl === 'string' && bunnyUrl) return bunnyUrl
  const url = image.url
  return typeof url === 'string' && url ? url : null
}

function extractLocation(doc: AttractionDocLike): string | null {
  if (!isRecord(doc.location)) return null
  const value = doc.location
  if (typeof value.city === 'string' && value.city.trim()) return value.city
  if (typeof value.country === 'string' && value.country.trim()) return value.country
  if (typeof value.value === 'string' && value.value.trim()) return value.value
  return null
}

function normalizeAttractionCandidate(doc: AttractionDocLike): HomepageHotelCandidate {
  return {
    id: normalizeNumericId(doc.id) ?? 0,
    title: typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : 'Untitled',
    slug: typeof doc.slug === 'string' && doc.slug.trim() ? doc.slug : null,
    type: typeof doc.type === 'string' && doc.type.trim() ? doc.type : null,
    priceLevel: typeof doc.priceLevel === 'string' && doc.priceLevel.trim() ? doc.priceLevel : null,
    status: typeof doc.status === 'string' && doc.status.trim() ? doc.status : null,
    updatedAt: typeof doc.updatedAt === 'string' && doc.updatedAt.trim() ? doc.updatedAt : null,
    imageUrl: extractImageUrl(doc),
    location: extractLocation(doc),
  }
}

export function normalizeThingsToDoAttractionsInput(rawItems: unknown): HomepageHotelItemRef[] {
  if (!Array.isArray(rawItems)) return []
  const refs = rawItems.map((item) => normalizeThingsToDoAttractionRef(item))
  if (refs.some((item) => item === null)) {
    throw new Error('Things to Do (places) items must use numeric attraction ids.')
  }
  return refs as HomepageHotelItemRef[]
}

function normalizeThingsToDoAttractionRef(value: unknown): HomepageHotelItemRef | null {
  if (typeof value === 'number' || typeof value === 'string') {
    const id = normalizeNumericId(value)
    return id ? { id } : null
  }

  if (!isRecord(value)) return null
  const directId = normalizeNumericId(value.id)
  if (directId !== null) return { id: directId }
  if (isRecord(value.value)) {
    const nestedId = normalizeNumericId(value.value.id)
    if (nestedId !== null) return { id: nestedId }
  }
  const valueId = normalizeNumericId(value.value)
  if (valueId !== null) return { id: valueId }
  return null
}

function parseAttractionSlots(rawItems: unknown): ParsedAttractionSlot[] {
  if (!Array.isArray(rawItems)) return []
  return rawItems.map((rawItem, index) => {
    const ref = normalizeThingsToDoAttractionRef(rawItem)
    return { slot: index + 1, ref, reason: ref ? null : 'invalid_reference' }
  })
}

async function findAttractionDoc(
  payload: Payload,
  ref: HomepageHotelItemRef,
): Promise<HomepageHotelCandidate | null> {
  try {
    const doc = await payload.findByID({
      collection: 'attractions',
      id: ref.id,
      depth: 1,
      overrideAccess: true,
    })
    return normalizeAttractionCandidate(doc as AttractionDocLike)
  } catch {
    return null
  }
}

export function buildThingsToDoAttractionsGlobalData(items: HomepageHotelItemRef[]) {
  return { items: items.map((item) => item.id) }
}

export async function validateThingsToDoAttractionsItems(
  payload: Payload,
  refs: HomepageHotelItemRef[],
  options: { allowDrafts?: boolean; slotCount?: number } = {},
): Promise<HomepageHotelItemRef[]> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const slotCount = options.slotCount ?? HOMEPAGE_FEATURED_CONTENT_SLOTS

  if (refs.length !== slotCount) {
    throw new Error(`This block requires exactly ${slotCount} item${slotCount === 1 ? '' : 's'}.`)
  }

  const ids = new Set<number>()
  for (const ref of refs) {
    if (ids.has(ref.id)) throw new Error('Things to Do (places) cannot contain duplicate attractions.')
    ids.add(ref.id)
  }

  await Promise.all(
    refs.map(async (ref) => {
      const candidate = await findAttractionDoc(payload, ref)
      if (!candidate) throw new Error(`Attraction #${ref.id} could not be found.`)
      if (!allowDrafts && candidate.status !== 'published') {
        throw new Error(`Attraction "${candidate.title}" must be published before it can be featured.`)
      }
    }),
  )

  return refs
}

export async function getThingsToDoAttractionsSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: { allowDrafts?: boolean; totalSlots?: number } = {},
): Promise<HomepageHotelSelection> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const totalSlots = options.totalSlots ?? HOMEPAGE_FEATURED_CONTENT_SLOTS
  const parsedSlots = parseAttractionSlots(rawItems)
  const items: HomepageHotelCandidate[] = []
  const invalidItems: HomepageHotelInvalidItem[] = []

  for (const slot of parsedSlots) {
    if (!slot.ref) {
      invalidItems.push({ slot: slot.slot, reason: slot.reason || 'invalid_reference' })
      continue
    }
    const candidate = await findAttractionDoc(payload, slot.ref)
    if (!candidate) {
      invalidItems.push({ slot: slot.slot, id: slot.ref.id, reason: 'not_found' })
      continue
    }
    if (!allowDrafts && candidate.status !== 'published') {
      invalidItems.push({ slot: slot.slot, id: candidate.id, title: candidate.title, reason: 'not_published' })
      continue
    }
    items.push({ ...candidate, slot: slot.slot })
  }

  return {
    items,
    invalidItems,
    allowDrafts,
    totalSlots,
    isComplete: items.length === totalSlots && invalidItems.length === 0 && parsedSlots.length === totalSlots,
  }
}

function sortAttractions(left: HomepageHotelCandidate, right: HomepageHotelCandidate): number {
  const leftTimestamp = Date.parse(left.updatedAt || '') || 0
  const rightTimestamp = Date.parse(right.updatedAt || '') || 0
  if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp
  return left.title.localeCompare(right.title)
}

export async function searchThingsToDoAttractionCandidates(
  payload: Payload,
  options: { query?: string; page?: number; limit?: number; allowDrafts?: boolean } = {},
): Promise<HomepageHotelCandidatesResponse> {
  const query = options.query?.trim() || ''
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const page = Number.isFinite(options.page) && (options.page || 0) > 0 ? Math.trunc(options.page!) : 1
  const limit = Number.isFinite(options.limit) && (options.limit || 0) > 0
    ? Math.min(Math.trunc(options.limit!), 50)
    : 24

  const whereClauses: PayloadFindWhere[] = []
  if (query) {
    whereClauses.push({
      or: [{ title: { like: query } }, { slug: { like: query } }],
    })
  }
  if (!allowDrafts) {
    whereClauses.push({ status: { equals: 'published' } })
  }

  const where: PayloadFindWhere | undefined = whereClauses.length > 1 ? { and: whereClauses } : whereClauses[0]
  const response = await payload.find({
    collection: 'attractions',
    depth: 1,
    limit,
    page,
    sort: '-updatedAt',
    where,
    overrideAccess: true,
  })

  const docs = (response.docs || []).map((doc) => normalizeAttractionCandidate(doc as AttractionDocLike)).sort(sortAttractions)
  return {
    docs,
    totalDocs: response.totalDocs || 0,
    totalPages: response.totalPages || 1,
    page: response.page || page,
    limit: response.limit || limit,
    allowDrafts,
  }
}
