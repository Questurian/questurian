import type { PayloadRequest } from 'payload'
import type {
  ItemMediaBlockSlug,
  ItemMediaSourceCollection,
  SourceItemMediaIds,
} from '../../types/item-media.types'
import { normalizeRelationshipId } from './relationshipIds'

const blockSlugToSourceCollection: Record<ItemMediaBlockSlug, ItemMediaSourceCollection> = {
  'data-dining': 'dining',
  'data-accommodations': 'accommodations',
  'data-attractions': 'attractions',
  'data-nightlife': 'nightlife',
  'itinerary-dining': 'dining',
  'itinerary-accommodations': 'accommodations',
  'itinerary-where-staying': 'accommodations',
  'itinerary-attractions': 'attractions',
  'itinerary-nightlife': 'nightlife',
  'itinerary-key-location': 'key-locations',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const uniqueRelationshipIds = (ids: Array<string | number>): Array<string | number> => {
  const seen = new Set<string>()
  const unique: Array<string | number> = []

  for (const id of ids) {
    const key = String(id)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    unique.push(id)
  }

  return unique
}

const collectRelationshipIds = (rows: unknown, relationshipKey: string): Array<string | number> => {
  if (!Array.isArray(rows)) {
    return []
  }

  const relationshipIds = rows
    .map((row) => {
      if (!isRecord(row)) {
        return null
      }

      return normalizeRelationshipId(row[relationshipKey])
    })
    .filter((id): id is string | number => id !== null)

  return uniqueRelationshipIds(relationshipIds)
}

export const getSourceCollectionForBlockType = (
  blockType: unknown,
): ItemMediaSourceCollection | null => {
  if (typeof blockType !== 'string') {
    return null
  }

  return blockSlugToSourceCollection[blockType as ItemMediaBlockSlug] ?? null
}

export const extractSourceItemMediaIds = (sourceItem: unknown): SourceItemMediaIds => {
  if (!isRecord(sourceItem)) {
    return {
      photoIds: [],
      instagramPostIds: [],
    }
  }

  return {
    photoIds: collectRelationshipIds(sourceItem.gallery, 'image'),
    instagramPostIds: collectRelationshipIds(sourceItem.instagramGallery, 'post'),
  }
}

export const fetchListicleSourceItem = async (
  req: PayloadRequest,
  sourceCollection: ItemMediaSourceCollection,
  itemId: string | number,
): Promise<Record<string, unknown> | null> => {
  try {
    const sourceItem = await req.payload.findByID({
      collection: sourceCollection,
      id: itemId,
      depth: 0,
    })

    if (!isRecord(sourceItem)) {
      return null
    }

    return sourceItem
  } catch {
    return null
  }
}
