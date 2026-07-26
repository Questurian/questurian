import type {
  InstagramPostOption,
  ItineraryBlockType,
  ItineraryItemBlock,
  MediaAssetOption,
  RelatedItemOption
} from '../../types'
import { relatedCollectionToBlockType } from '../../types'
import {
  resolveImageUrl,
  resolveInstagramPermalink
} from '../../../../shared/builder/utils/item-media.utils'
import {
  compactValue,
  isRecord,
  normalizeText,
  resolveEntityGeo,
  resolveEntityName,
  toFiniteNumber
} from '../../../../shared/builder/services/structured-data-template-core.service'

export type ManualStopSchemaDetails = {
  imageUrl?: string
  instagramPermalink?: string
  startingPoint?: Record<string, unknown>
  keyLocations: Array<Record<string, unknown>>
}

const isLatitude = (value: number | undefined): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= -90 &&
  value <= 90

const isLongitude = (value: number | undefined): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= -180 &&
  value <= 180

function resolveManualImageUrl(
  itineraryItem: ItineraryItemBlock,
  mediaAssets: MediaAssetOption[]
): string | undefined {
  if (!itineraryItem.image) return undefined
  const selectedAsset = mediaAssets.find(
    (asset) => asset.id === itineraryItem.image
  )
  return selectedAsset ? resolveImageUrl(selectedAsset) : undefined
}

function resolveManualInstagramPermalink(
  itineraryItem: ItineraryItemBlock,
  instagramPosts: InstagramPostOption[]
): string | undefined {
  if (!itineraryItem.instagramPost) return undefined
  const selectedPost = instagramPosts.find(
    (post) => post.id === itineraryItem.instagramPost
  )
  return selectedPost ? resolveInstagramPermalink(selectedPost) : undefined
}

function resolveManualStartingPoint(
  itineraryItem: ItineraryItemBlock
): Record<string, unknown> | undefined {
  const latitude = toFiniteNumber(itineraryItem.startingPoint.latitude)
  const longitude = toFiniteNumber(itineraryItem.startingPoint.longitude)

  if (!isLatitude(latitude) || !isLongitude(longitude)) {
    return undefined
  }

  return compactValue({
    '@type': 'Place',
    name: normalizeText(itineraryItem.startingPoint.label),
    geo: {
      '@type': 'GeoCoordinates',
      latitude,
      longitude
    }
  }) as Record<string, unknown>
}

function resolveManualKeyLocations(
  itineraryItem: ItineraryItemBlock,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
): Array<Record<string, unknown>> {
  return itineraryItem.keyLocations
    .map((location) => {
      if (location.source === 'existing') {
        if (!location.relatedCollection || !location.relatedItem) {
          return null
        }

        const blockType = relatedCollectionToBlockType(
          location.relatedCollection
        )
        const relatedItem = (relatedByBlockType[blockType] || []).find(
          (entry) => entry.id === location.relatedItem
        )
        if (!relatedItem || !isRecord(relatedItem)) {
          return null
        }

        return compactValue({
          '@type': 'Place',
          name:
            resolveEntityName(relatedItem) || normalizeText(relatedItem.title),
          geo: resolveEntityGeo(relatedItem)
        }) as Record<string, unknown>
      }

      const name = normalizeText(location.title)
      const latitude = toFiniteNumber(location.latitude)
      const longitude = toFiniteNumber(location.longitude)
      if (!name) {
        return null
      }

      return compactValue({
        '@type': 'Place',
        name,
        geo:
          latitude !== undefined && longitude !== undefined
            ? {
                '@type': 'GeoCoordinates',
                latitude,
                longitude
              }
            : undefined
      }) as Record<string, unknown>
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
}

export function resolveManualStopSchemaDetails(input: {
  itineraryItem: ItineraryItemBlock
  mediaAssets: MediaAssetOption[]
  instagramPosts: InstagramPostOption[]
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
}): ManualStopSchemaDetails {
  const { itineraryItem, mediaAssets, instagramPosts, relatedByBlockType } =
    input

  return {
    imageUrl: resolveManualImageUrl(itineraryItem, mediaAssets),
    instagramPermalink: resolveManualInstagramPermalink(
      itineraryItem,
      instagramPosts
    ),
    startingPoint: resolveManualStartingPoint(itineraryItem),
    keyLocations: resolveManualKeyLocations(itineraryItem, relatedByBlockType)
  }
}
