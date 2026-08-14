import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'

type DynamicPayload = {
  find: (options: Record<string, unknown>) => Promise<{ docs: Record<string, unknown>[] }>
  update: (options: Record<string, unknown>) => Promise<unknown>
  create: (options: Record<string, unknown>) => Promise<unknown>
  delete: (options: Record<string, unknown>) => Promise<unknown>
}

function dynamicPayload(req: PayloadRequest): DynamicPayload {
  return req.payload as unknown as DynamicPayload
}

type DetailTypeField =
  | 'diningType'
  | 'accommodationType'
  | 'nightlifeType'
  | 'attractionType'

type DetailCollectionConfig = {
  collection: string
  field: DetailTypeField
}

const categoryToDetailCollection: Record<string, DetailCollectionConfig> = {
  dining: { collection: 'dining-details', field: 'diningType' },
  accommodations: { collection: 'accommodation-details', field: 'accommodationType' },
  nightlife: { collection: 'nightlife-details', field: 'nightlifeType' },
  attractions: { collection: 'attraction-details', field: 'attractionType' },
}

const extractRelationshipIds = (values: unknown): Array<string | number> => {
  if (!Array.isArray(values)) return []

  return values.flatMap((value) => {
    if (typeof value === 'string' || typeof value === 'number') return [value]
    if (typeof value !== 'object' || value === null || !('id' in value)) return []

    const id = value.id
    return typeof id === 'string' || typeof id === 'number' ? [id] : []
  })
}

async function fetchCategories(req: PayloadRequest, ids: Array<string | number>) {
  if (ids.length === 0) return []

  const result = await dynamicPayload(req).find({
    collection: 'place-categories',
    where: { id: { in: ids } },
    depth: 0,
  })
  return result.docs
}

async function upsertDetailRecord(params: {
  req: PayloadRequest
  placeId: string | number
  config: DetailCollectionConfig
  typeValue: string | undefined
}) {
  const { req, placeId, config, typeValue } = params
  const existing = await dynamicPayload(req).find({
    collection: config.collection,
    where: { place: { equals: placeId } },
    depth: 0,
  })

  if (existing.docs.length > 0) {
    if (typeValue !== undefined) {
      await dynamicPayload(req).update({
        collection: config.collection,
        id: existing.docs[0].id,
        data: { type: typeValue || null },
      })
    }
  } else if (typeValue) {
    await dynamicPayload(req).create({
      collection: config.collection,
      data: {
        place: placeId,
        type: typeValue,
      },
    })
  }
}

async function deleteRemovedDetailRecords(params: {
  req: PayloadRequest
  placeId: string | number
  removedCategoryIds: Array<string | number>
}) {
  const { req, placeId, removedCategoryIds } = params
  const removedCategories = await fetchCategories(req, removedCategoryIds)

  for (const category of removedCategories) {
    const slug = typeof category.slug === 'string' ? category.slug : ''
    const config = categoryToDetailCollection[slug]
    if (!config) continue

    try {
      await dynamicPayload(req).delete({
        collection: config.collection,
        where: { place: { equals: placeId } },
      })
    } catch {
      // A removed category may not have a detail record.
    }
  }
}

export const syncPlaceDetails: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
  context,
}) => {
  if (operation === 'create') return doc

  const detailTypes = context.detailTypes as
    | Partial<Record<DetailTypeField, string>>
    | undefined
  const currentCategoryIds = extractRelationshipIds(doc.categories)
  const currentCategories = await fetchCategories(req, currentCategoryIds)

  for (const category of currentCategories) {
    const slug = typeof category.slug === 'string' ? category.slug : ''
    const config = categoryToDetailCollection[slug]
    if (!config) continue

    await upsertDetailRecord({
      req,
      placeId: doc.id,
      config,
      typeValue: detailTypes?.[config.field],
    })
  }

  if (previousDoc) {
    const previousCategoryIds = extractRelationshipIds(previousDoc.categories)
    const currentCategoryKeys = new Set(currentCategoryIds.map(String))
    const removedCategoryIds = previousCategoryIds.filter(
      (id) => !currentCategoryKeys.has(String(id)),
    )

    if (removedCategoryIds.length > 0) {
      await deleteRemovedDetailRecords({
        req,
        placeId: doc.id,
        removedCategoryIds,
      })
    }
  }

  return doc
}
