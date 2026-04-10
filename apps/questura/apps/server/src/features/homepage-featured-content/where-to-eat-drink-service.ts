import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import {
  buildHomepageFeaturedGlobalData,
  getHomepageFeaturedSelectionFromItems,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from './service'
import type {
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection,
} from './types'

const DINING_LISTICLE_TYPE = 'dining'
const SINGLE_TYPE_LISTICLES_COLLECTION = 'single-type-listicles'

function toRefKey(ref: HomepageFeaturedItemRef): string {
  return `${ref.relationTo}:${ref.id}`
}

export function normalizeWhereToEatDrinkInput(rawItems: unknown): HomepageFeaturedItemRef[] {
  const refs = normalizeHomepageFeaturedInput(rawItems)
  if (refs.some((ref) => ref.relationTo !== SINGLE_TYPE_LISTICLES_COLLECTION)) {
    throw new Error('Where to Eat & Drink blocks only support single-type-listicles items.')
  }
  return refs
}

export function buildWhereToEatDrinkGlobalData(items: HomepageFeaturedItemRef[]) {
  return buildHomepageFeaturedGlobalData(items)
}

export async function validateWhereToEatDrinkItems(
  payload: Payload,
  refs: HomepageFeaturedItemRef[],
  options: { allowDrafts?: boolean; slotCount?: number } = {},
): Promise<HomepageFeaturedItemRef[]> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const validated = await validateHomepageFeaturedItems(payload, refs, {
    allowDrafts,
    slotCount: options.slotCount,
  })

  await Promise.all(
    validated.map(async (ref) => {
      if (ref.relationTo !== SINGLE_TYPE_LISTICLES_COLLECTION) {
        throw new Error('Where to Eat & Drink blocks only support single-type-listicles items.')
      }
      const doc = await payload.findByID({
        collection: SINGLE_TYPE_LISTICLES_COLLECTION,
        id: ref.id,
        depth: 0,
        overrideAccess: true,
      }) as { listicleType?: unknown; title?: unknown }

      if (doc.listicleType !== DINING_LISTICLE_TYPE) {
        const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title : `#${ref.id}`
        throw new Error(`"${title}" is not a dining listicle and cannot be used in this block.`)
      }
    }),
  )

  return validated
}

export async function getWhereToEatDrinkSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: { allowDrafts?: boolean; totalSlots?: number } = {},
): Promise<HomepageFeaturedSelection> {
  const selection = await getHomepageFeaturedSelectionFromItems(payload, rawItems, options)
  if (selection.items.length === 0) return selection

  const allowedIds = new Set<number>()
  for (const item of selection.items) {
    if (item.relationTo !== SINGLE_TYPE_LISTICLES_COLLECTION) continue
    allowedIds.add(item.id)
  }

  const docs = allowedIds.size > 0
    ? await payload.find({
        collection: SINGLE_TYPE_LISTICLES_COLLECTION,
        depth: 0,
        limit: Math.max(allowedIds.size, 1),
        page: 1,
        where: {
          and: [
            { id: { in: [...allowedIds] } },
            { listicleType: { equals: DINING_LISTICLE_TYPE } },
          ],
        },
        overrideAccess: true,
      })
    : { docs: [] as Array<{ id?: unknown }> }

  const validIds = new Set(
    (docs.docs || [])
      .map((doc) => (typeof doc.id === 'number' ? doc.id : Number(doc.id)))
      .filter((id) => Number.isFinite(id)),
  )

  const items = selection.items.filter(
    (item) => item.relationTo === SINGLE_TYPE_LISTICLES_COLLECTION && validIds.has(item.id),
  )
  const removedKeys = new Set(
    selection.items
      .filter((item) => !items.some((next) => next.relationTo === item.relationTo && next.id === item.id))
      .map((item) => toRefKey(item)),
  )

  const invalidItems = [
    ...selection.invalidItems,
    ...selection.items
      .filter((item) => removedKeys.has(toRefKey(item)))
      .map((item) => ({
        slot: item.slot ?? 0,
        relationTo: item.relationTo,
        id: item.id,
        collectionLabel: item.collectionLabel,
        reason: 'invalid_reference' as const,
      })),
  ]

  return {
    ...selection,
    items,
    invalidItems,
    isComplete: items.length === selection.totalSlots && invalidItems.length === 0,
  }
}

export async function searchWhereToEatDrinkCandidates(
  payload: Payload,
  options: {
    query?: string
    page?: number
    limit?: number
    allowDrafts?: boolean
  } = {},
): Promise<HomepageFeaturedCandidatesResponse> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const query = options.query?.trim() || ''
  const page = Number.isFinite(options.page) && (options.page || 0) > 0 ? Math.trunc(options.page!) : 1
  const limit = Number.isFinite(options.limit) && (options.limit || 0) > 0
    ? Math.min(Math.trunc(options.limit!), 50)
    : 24

  const whereClauses: Array<Record<string, unknown>> = [
    { listicleType: { equals: DINING_LISTICLE_TYPE } },
  ]
  if (query) {
    whereClauses.push({
      or: [{ title: { like: query } }, { slug: { like: query } }],
    })
  }
  if (!allowDrafts) {
    whereClauses.push({ status: { equals: 'published' } })
  }

  const response = await payload.find({
    collection: SINGLE_TYPE_LISTICLES_COLLECTION,
    depth: 1,
    page,
    limit,
    sort: '-updatedAt',
    where: whereClauses.length > 1 ? { and: whereClauses } : whereClauses[0],
    overrideAccess: true,
  })

  const selection = await getHomepageFeaturedSelectionFromItems(
    payload,
    (response.docs || []).map((doc) => ({
      relationTo: SINGLE_TYPE_LISTICLES_COLLECTION,
      id: typeof doc.id === 'number' ? doc.id : Number(doc.id),
    })),
    { allowDrafts, totalSlots: response.docs.length },
  )

  return {
    docs: selection.items.map((item) => ({ ...item, slot: undefined })),
    totalDocs: response.totalDocs || 0,
    totalPages: response.totalPages || 1,
    page: response.page || page,
    limit: response.limit || limit,
    allowDrafts,
  }
}
