import type { Payload } from 'payload'

import { getMediaSetPreviewAsset } from '@/features/media/lib/media-set-preview'
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

type TourDocLike = {
  id?: unknown
  title?: unknown
  bookingLink?: unknown
  price?: unknown
  status?: unknown
  updatedAt?: unknown
  locationRef?: unknown
  img?: unknown
}

type ParsedTourSlot = {
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

function extractImageUrl(doc: TourDocLike): string | null {
  if (!isRecord(doc.img)) return null
  const fromMediaSet = getMediaSetPreviewAsset(doc.img as Parameters<typeof getMediaSetPreviewAsset>[0])
  if (fromMediaSet?.url && typeof fromMediaSet.url === 'string' && fromMediaSet.url) {
    return fromMediaSet.url
  }
  const bunnyUrl = doc.img.bunny_original_url
  if (typeof bunnyUrl === 'string' && bunnyUrl) return bunnyUrl
  const url = doc.img.url
  return typeof url === 'string' && url ? url : null
}

function extractLocation(doc: TourDocLike): string | null {
  if (!isRecord(doc.locationRef)) return null
  const loc = doc.locationRef
  if (typeof loc.cityName === 'string' && loc.cityName.trim()) return loc.cityName.trim()
  if (typeof loc.countryName === 'string' && loc.countryName.trim()) return loc.countryName.trim()
  if (typeof loc.locationKey === 'string' && loc.locationKey.trim()) return loc.locationKey.trim()
  return null
}

function normalizeTourCandidate(doc: TourDocLike): HomepageHotelCandidate {
  return {
    id: normalizeNumericId(doc.id) ?? 0,
    title: typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : 'Untitled',
    slug: typeof doc.bookingLink === 'string' && doc.bookingLink.trim() ? doc.bookingLink.trim() : null,
    type: 'tour',
    priceLevel: typeof doc.price === 'string' && doc.price.trim() ? doc.price.trim() : null,
    status: typeof doc.status === 'string' && doc.status.trim() ? doc.status : null,
    updatedAt: typeof doc.updatedAt === 'string' && doc.updatedAt.trim() ? doc.updatedAt : null,
    imageUrl: extractImageUrl(doc),
    location: extractLocation(doc),
  }
}

function normalizeTourGridRef(value: unknown): HomepageHotelItemRef | null {
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

export function normalizeTourGridInput(rawItems: unknown): HomepageHotelItemRef[] {
  if (!Array.isArray(rawItems)) return []
  const refs = rawItems.map((item) => normalizeTourGridRef(item))
  if (refs.some((item) => item === null)) {
    throw new Error('Tour grid items must use numeric tour ids.')
  }
  return refs as HomepageHotelItemRef[]
}

function parseTourGridSlots(rawItems: unknown): ParsedTourSlot[] {
  if (!Array.isArray(rawItems)) return []
  return rawItems.map((rawItem, index) => {
    const ref = normalizeTourGridRef(rawItem)
    return { slot: index + 1, ref, reason: ref ? null : 'invalid_reference' }
  })
}

async function findTourDoc(payload: Payload, ref: HomepageHotelItemRef): Promise<HomepageHotelCandidate | null> {
  try {
    const doc = await payload.findByID({
      collection: 'tours',
      id: ref.id,
      depth: 2,
      overrideAccess: true,
    })
    return normalizeTourCandidate(doc as TourDocLike)
  } catch {
    return null
  }
}

export function buildTourGridGlobalData(items: HomepageHotelItemRef[]) {
  return { items: items.map((item) => item.id) }
}

export async function validateTourGridItems(
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
    if (ids.has(ref.id)) throw new Error('Tour grid cannot contain duplicate tours.')
    ids.add(ref.id)
  }

  await Promise.all(
    refs.map(async (ref) => {
      const candidate = await findTourDoc(payload, ref)
      if (!candidate) throw new Error(`Tour #${ref.id} could not be found.`)
      if (!allowDrafts && candidate.status !== 'published') {
        throw new Error(`Tour "${candidate.title}" must be published before it can be featured.`)
      }
    }),
  )

  return refs
}

export async function getTourGridSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: { allowDrafts?: boolean; totalSlots?: number } = {},
): Promise<HomepageHotelSelection> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const totalSlots = options.totalSlots ?? HOMEPAGE_FEATURED_CONTENT_SLOTS
  const parsedSlots = parseTourGridSlots(rawItems)
  const items: HomepageHotelCandidate[] = []
  const invalidItems: HomepageHotelInvalidItem[] = []

  for (const slot of parsedSlots) {
    if (!slot.ref) {
      invalidItems.push({ slot: slot.slot, reason: slot.reason || 'invalid_reference' })
      continue
    }
    const candidate = await findTourDoc(payload, slot.ref)
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

function sortTours(left: HomepageHotelCandidate, right: HomepageHotelCandidate): number {
  const leftTimestamp = Date.parse(left.updatedAt || '') || 0
  const rightTimestamp = Date.parse(right.updatedAt || '') || 0
  if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp
  return left.title.localeCompare(right.title)
}

export async function searchTourGridCandidates(
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
    whereClauses.push({ title: { like: query } })
  }
  if (!allowDrafts) {
    whereClauses.push({ status: { equals: 'published' } })
  }

  const where: PayloadFindWhere | undefined = whereClauses.length > 1 ? { and: whereClauses } : whereClauses[0]
  const response = await payload.find({
    collection: 'tours',
    depth: 2,
    limit,
    page,
    sort: '-updatedAt',
    where,
    overrideAccess: true,
  })

  const docs = (response.docs || []).map((doc) => normalizeTourCandidate(doc as TourDocLike)).sort(sortTours)
  return {
    docs,
    totalDocs: response.totalDocs || 0,
    totalPages: response.totalPages || 1,
    page: response.page || page,
    limit: response.limit || limit,
    allowDrafts,
  }
}
