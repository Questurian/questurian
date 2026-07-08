import type { Payload } from 'payload'

import type { PayloadFindWhere } from '@/shared/utils/payload-types'

import { validateHomepageFeaturedItems } from '../featured-articles/operations/validate'
import {
  buildHomepageFeaturedGlobalData,
  normalizeHomepageFeaturedInput,
} from '../featured-articles/lib/refs'
import { getHomepageFeaturedSelectionFromItems } from '../featured-articles/operations/selection'
import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedCollection,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection,
  HomepageFeaturedSelectionOptions,
  HomepageFeaturedValidationOptions,
} from '../featured-articles/types'

import {
  combinePayloadWhereClauses,
  normalizeReferenceGridSearchOptions,
  type ReferenceGridSearchOptions,
} from './numeric-grid'
import { toReferenceKey } from './refs'

export type SingleTypeListicleDocLike = {
  id?: unknown
  title?: unknown
  listicleType?: unknown
}

export type SingleTypeListicleGridConfig = {
  collection: HomepageFeaturedCollection
  listicleType: string
  invalidCollectionMessage: string
  invalidTypeMessage: (doc: SingleTypeListicleDocLike, ref: HomepageFeaturedItemRef) => string
}

export function normalizeSingleTypeListicleGridInput<TRef extends HomepageFeaturedItemRef>(
  rawItems: unknown,
  config: SingleTypeListicleGridConfig,
): TRef[] {
  const refs = normalizeHomepageFeaturedInput(rawItems)
  if (refs.some((ref) => ref.relationTo !== config.collection)) {
    throw new Error(config.invalidCollectionMessage)
  }
  return refs as TRef[]
}

export function buildSingleTypeListicleGridData<TRef extends HomepageFeaturedItemRef>(
  items: TRef[],
) {
  return buildHomepageFeaturedGlobalData(items)
}

export async function findSingleTypeListicleDoc(
  payload: Payload,
  ref: HomepageFeaturedItemRef,
  config: SingleTypeListicleGridConfig,
): Promise<SingleTypeListicleDocLike> {
  return (await payload.findByID({
    collection: config.collection,
    id: ref.id,
    depth: 0,
    overrideAccess: true,
  })) as SingleTypeListicleDocLike
}

export async function validateSingleTypeListicleGridItems<TRef extends HomepageFeaturedItemRef>(
  payload: Payload,
  refs: TRef[],
  options: HomepageFeaturedValidationOptions,
  config: SingleTypeListicleGridConfig,
): Promise<TRef[]> {
  const validated = await validateHomepageFeaturedItems(payload, refs, options)

  await Promise.all(
    validated.map(async (ref) => {
      if (ref.relationTo !== config.collection) {
        throw new Error(config.invalidCollectionMessage)
      }
      const doc = await findSingleTypeListicleDoc(payload, ref, config)
      if (doc.listicleType !== config.listicleType) {
        throw new Error(config.invalidTypeMessage(doc, ref))
      }
    }),
  )

  return validated as TRef[]
}

export async function getSingleTypeListicleGridSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: HomepageFeaturedSelectionOptions,
  config: SingleTypeListicleGridConfig,
): Promise<HomepageFeaturedSelection> {
  const selection = await getHomepageFeaturedSelectionFromItems(payload, rawItems, options)
  if (selection.items.length === 0) return selection

  const allowedIds = new Set<number>()
  for (const item of selection.items) {
    if (item.relationTo !== config.collection) continue
    allowedIds.add(item.id)
  }

  const docs =
    allowedIds.size > 0
      ? await payload.find({
          collection: config.collection,
          depth: 0,
          limit: Math.max(allowedIds.size, 1),
          page: 1,
          where: {
            and: [
              { id: { in: [...allowedIds] } },
              { listicleType: { equals: config.listicleType } },
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
    (item) => item.relationTo === config.collection && validIds.has(item.id),
  )
  const removedKeys = new Set(
    selection.items
      .filter(
        (item) => !items.some((next) => next.relationTo === item.relationTo && next.id === item.id),
      )
      .map((item) => toReferenceKey(item)),
  )

  const invalidItems = [
    ...selection.invalidItems,
    ...selection.items
      .filter((item) => removedKeys.has(toReferenceKey(item)))
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

export async function searchSingleTypeListicleGridCandidates(
  payload: Payload,
  options: ReferenceGridSearchOptions,
  config: SingleTypeListicleGridConfig,
): Promise<HomepageFeaturedCandidatesResponse> {
  const { allowDrafts, query, page, limit } = normalizeReferenceGridSearchOptions(options)
  const whereClauses: PayloadFindWhere[] = [{ listicleType: { equals: config.listicleType } }]
  if (query) {
    whereClauses.push({
      or: [{ title: { like: query } }, { slug: { like: query } }],
    })
  }
  if (!allowDrafts) {
    whereClauses.push({ status: { equals: 'published' } })
  }

  const response = await payload.find({
    collection: config.collection,
    depth: 1,
    page,
    limit,
    sort: '-updatedAt',
    where: combinePayloadWhereClauses(whereClauses),
    overrideAccess: true,
  })

  const selection = await getHomepageFeaturedSelectionFromItems(
    payload,
    (response.docs || []).map((doc) => ({
      relationTo: config.collection,
      id: typeof doc.id === 'number' ? doc.id : Number(doc.id),
    })),
    { allowDrafts, totalSlots: response.docs.length },
  )

  return {
    docs: selection.items.map((item: HomepageFeaturedCandidate) => ({ ...item, slot: undefined })),
    totalDocs: response.totalDocs || 0,
    totalPages: response.totalPages || 1,
    page: response.page || page,
    limit: response.limit || limit,
    allowDrafts,
  }
}
