import type { Field, FilterOptionsProps, PayloadRequest, Where } from 'payload'

type ItemMediaBlockSlug =
  | 'data-dining'
  | 'data-accommodations'
  | 'data-attractions'
  | 'data-nightlife'
  | 'itinerary-dining'
  | 'itinerary-accommodations'
  | 'itinerary-attractions'
  | 'itinerary-nightlife'
  | 'itinerary-key-location'

export type ItemMediaSourceCollection =
  | 'dining'
  | 'accommodations'
  | 'attractions'
  | 'nightlife'
  | 'key-locations'

export const mediaModeOptions = [
  { label: 'Photos', value: 'photos' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Photos + Instagram', value: 'both' },
] as const

export type MediaMode = (typeof mediaModeOptions)[number]['value']

type ItemMediaFieldOptions = {
  mediaModeDbName?: string
  mediaModeEnumName?: string
  modeDescription?: string
  photosDescription?: string
  instagramDescription?: string
}

const defaultItemMediaFieldOptions: Required<ItemMediaFieldOptions> = {
  mediaModeDbName: 'mm',
  mediaModeEnumName: 'stl_media_mode',
  modeDescription: 'Select whether this list item uses photos, Instagram, or both.',
  photosDescription: 'Select 1 to 6 photos from the selected source item gallery.',
  instagramDescription: 'Select one Instagram embed from the selected source item.',
}

const emptyFilterWhere: Where = {
  id: {
    exists: false,
  },
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

export const normalizeRelationshipId = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }

  if (!isRecord(value)) {
    return null
  }

  const directId = value.id
  if (typeof directId === 'string' || typeof directId === 'number') {
    return directId
  }

  const relationshipValue = value.value
  if (typeof relationshipValue === 'string' || typeof relationshipValue === 'number') {
    return relationshipValue
  }

  if (isRecord(relationshipValue)) {
    const nestedId = relationshipValue.id
    if (typeof nestedId === 'string' || typeof nestedId === 'number') {
      return nestedId
    }
  }

  return null
}

export const normalizeRelationshipIds = (value: unknown): Array<string | number> => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => normalizeRelationshipId(entry))
    .filter((id): id is string | number => id !== null)
}

export const relationshipIdToKey = (id: string | number): string => String(id)

export const blockSlugToSourceCollection: Record<ItemMediaBlockSlug, ItemMediaSourceCollection> = {
  'data-dining': 'dining',
  'data-accommodations': 'accommodations',
  'data-attractions': 'attractions',
  'data-nightlife': 'nightlife',
  'itinerary-dining': 'dining',
  'itinerary-accommodations': 'accommodations',
  'itinerary-attractions': 'attractions',
  'itinerary-nightlife': 'nightlife',
  'itinerary-key-location': 'key-locations',
}

export const getSourceCollectionForBlockType = (
  blockType: unknown,
): ItemMediaSourceCollection | null => {
  if (typeof blockType !== 'string') {
    return null
  }

  return blockSlugToSourceCollection[blockType as ItemMediaBlockSlug] ?? null
}

export const isMediaMode = (value: unknown): value is MediaMode =>
  value === 'photos' || value === 'instagram' || value === 'both'

export const getMediaMode = (value: unknown): MediaMode | null => {
  if (!isMediaMode(value)) {
    return null
  }

  return value
}

export const requiresPhotos = (mode: MediaMode | null | undefined): boolean =>
  mode === 'photos' || mode === 'both'

export const requiresInstagram = (mode: MediaMode | null | undefined): boolean =>
  mode === 'instagram' || mode === 'both'

type SourceItemMediaIds = {
  photoIds: Array<string | number>
  instagramPostIds: Array<string | number>
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

const getSelectedItemIdFromBlock = (
  siblingData: unknown,
  blockData: unknown,
): string | number | null => {
  if (isRecord(siblingData)) {
    const siblingItemId = normalizeRelationshipId(siblingData.item)
    if (siblingItemId !== null) {
      return siblingItemId
    }
  }

  if (isRecord(blockData)) {
    return normalizeRelationshipId(blockData.item)
  }

  return null
}

const createSourceMediaFilterOptions = (
  sourceCollection: ItemMediaSourceCollection,
  mediaType: 'photos' | 'instagram',
) => {
  return async ({ req, siblingData, blockData }: FilterOptionsProps): Promise<Where> => {
    const itemId = getSelectedItemIdFromBlock(siblingData, blockData)
    if (itemId === null) {
      return emptyFilterWhere
    }

    const sourceItem = await fetchListicleSourceItem(req, sourceCollection, itemId)
    if (!sourceItem) {
      return emptyFilterWhere
    }

    const { photoIds, instagramPostIds } = extractSourceItemMediaIds(sourceItem)
    const allowedIds = mediaType === 'photos' ? photoIds : instagramPostIds

    if (!allowedIds.length) {
      return emptyFilterWhere
    }

    return {
      id: {
        in: allowedIds,
      },
    } satisfies Where
  }
}

const getMediaModeFromSiblingData = (siblingData: unknown): MediaMode | null => {
  if (!isRecord(siblingData)) {
    return null
  }

  return getMediaMode(siblingData.mediaMode)
}

export const createSelectedPhotosFilterOptions = (sourceCollection: ItemMediaSourceCollection) =>
  createSourceMediaFilterOptions(sourceCollection, 'photos')

export const createSelectedInstagramFilterOptions = (
  sourceCollection: ItemMediaSourceCollection,
) => createSourceMediaFilterOptions(sourceCollection, 'instagram')

export const createItemMediaFields = (
  sourceCollection: ItemMediaSourceCollection,
  options?: ItemMediaFieldOptions,
): Field[] => {
  const config = {
    ...defaultItemMediaFieldOptions,
    ...options,
  }

  return [
    {
      name: 'mediaMode',
      type: 'select',
      dbName: config.mediaModeDbName,
      enumName: config.mediaModeEnumName,
      required: true,
      options: mediaModeOptions,
      admin: {
        description: config.modeDescription,
      },
    },
    {
      name: 'selectedPhotos',
      type: 'relationship',
      relationTo: 'media-sets',
      hasMany: true,
      minRows: 1,
      maxRows: 6,
      filterOptions: createSelectedPhotosFilterOptions(sourceCollection),
      admin: {
        description: config.photosDescription,
        condition: (_, siblingData) => requiresPhotos(getMediaModeFromSiblingData(siblingData)),
      },
    },
    {
      name: 'selectedInstagramPost',
      type: 'relationship',
      relationTo: 'instagram-posts',
      filterOptions: createSelectedInstagramFilterOptions(sourceCollection),
      admin: {
        allowCreate: true,
        description: config.instagramDescription,
        condition: (_, siblingData) => requiresInstagram(getMediaModeFromSiblingData(siblingData)),
      },
    },
  ]
}
