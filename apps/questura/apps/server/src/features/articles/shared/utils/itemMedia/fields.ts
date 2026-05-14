import type { Field, FilterOptionsProps, Where } from 'payload'
import {
  getMediaMode,
  requiresInstagram,
  requiresPhotos,
} from './mediaMode'
import { normalizeRelationshipId } from './relationshipIds'
import {
  extractSourceItemMediaIds,
  fetchListicleSourceItem,
} from './sourceItems'
import type {
  ItemMediaFieldOptions,
  ItemMediaSourceCollection,
  MediaMode,
} from '../../types/item-media.types'

const mediaModeOptions: Array<{ label: string; value: MediaMode }> = [
  { label: 'Photos', value: 'photos' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Photos + Instagram', value: 'both' },
]

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

const createSelectedPhotosFilterOptions = (sourceCollection: ItemMediaSourceCollection) =>
  createSourceMediaFilterOptions(sourceCollection, 'photos')

const createSelectedInstagramFilterOptions = (
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
