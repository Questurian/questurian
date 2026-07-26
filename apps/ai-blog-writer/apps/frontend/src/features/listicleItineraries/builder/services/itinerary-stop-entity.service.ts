import type {
  InstagramPostOption,
  ItineraryBlockType,
  ItineraryItemBlock,
  MediaAssetOption,
  RelatedItemOption
} from '../../types'
import { isManualItineraryBlockType } from '../../types'
import {
  compactValue,
  extractDraftText,
  isRecord,
  isValidAbsoluteHttpUrl,
  normalizeAbsoluteUrl,
  normalizeText,
  pickStringArray,
  resolveEntityAddress,
  resolveEntityGeo,
  resolveEntityName,
  resolveEntityPhone,
  resolveEntityPriceRange,
  resolveEntityTypeLabel,
  resolveEntityWebsite,
  resolveSelectedImageUrl,
  resolveSelectedInstagramPermalink,
  toStructuredDescription
} from '../../../../shared/builder/services/structured-data-template-core.service'
import {
  getItineraryStopTypeLabel,
  getSchemaTypeForItineraryBlockType
} from './itinerary-stop-schema.service'
import { resolveManualStopSchemaDetails } from './manual-stop-schema-resolver.service'

export function buildItineraryStopEntity(input: {
  itineraryItem: ItineraryItemBlock
  relatedItem?: RelatedItemOption
  mediaAssets?: MediaAssetOption[]
  instagramPosts?: InstagramPostOption[]
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  position: number
  includeUrlFields: boolean
}): Record<string, unknown> {
  const {
    itineraryItem,
    relatedItem,
    mediaAssets = [],
    instagramPosts = [],
    relatedByBlockType,
    position,
    includeUrlFields
  } = input
  const isManualStop = isManualItineraryBlockType(itineraryItem.blockType)
  const source = relatedItem && isRecord(relatedItem) ? relatedItem : null
  const manualDetails = isManualStop
    ? resolveManualStopSchemaDetails({
        itineraryItem,
        mediaAssets,
        instagramPosts,
        relatedByBlockType
      })
    : undefined
  const schemaType = getSchemaTypeForItineraryBlockType(itineraryItem.blockType)
  const itemName = isManualStop
    ? normalizeText(itineraryItem.title)
    : source
      ? resolveEntityName(source)
      : undefined
  const itemDescription = toStructuredDescription(
    extractDraftText(itineraryItem.blurbMarkdown, itineraryItem.blurbJsonText)
  )
  const itemAddress = source ? resolveEntityAddress(source) : undefined
  const itemWebsite = isManualStop
    ? normalizeAbsoluteUrl(itineraryItem.url)
    : source
      ? resolveEntityWebsite(source)
      : undefined
  const itemPhone = source ? resolveEntityPhone(source) : undefined
  const itemPriceRange = isManualStop
    ? normalizeText(itineraryItem.price)
    : source
      ? resolveEntityPriceRange(source)
      : undefined
  const itemTypeLabel = source ? resolveEntityTypeLabel(source) : undefined
  const itemGeo = source ? resolveEntityGeo(source) : undefined
  const itemImage = isManualStop
    ? manualDetails?.imageUrl
    : relatedItem
      ? resolveSelectedImageUrl(itineraryItem, relatedItem)
      : undefined
  const itemInstagram = isManualStop
    ? manualDetails?.instagramPermalink
    : relatedItem
      ? resolveSelectedInstagramPermalink(itineraryItem, relatedItem)
      : undefined
  const cuisines = source ? pickStringArray(source, [['cuisines']]) : []
  const idealFor = source
    ? pickStringArray(source, [
        ['idealFor'],
        ['nightlifeDetails', 'core', 'idealFor']
      ])
    : []
  const providerName = normalizeText(itineraryItem.operator)
  const keyLocationKeywords = (manualDetails?.keyLocations || [])
    .map((location) => normalizeText(location.name))
    .filter((location): location is string => Boolean(location))
  // schema.org has no `category` on Place subtypes, so the stop type label rides in `keywords`.
  const stopTypeKeyword =
    itemTypeLabel || getItineraryStopTypeLabel(itineraryItem.blockType)
  const keywordParts = [
    ...(isManualStop ? keyLocationKeywords : idealFor),
    stopTypeKeyword
  ].filter(Boolean)

  const entity: Record<string, unknown> = {
    '@type': schemaType,
    identifier: itineraryItem.item ?? `stop-${position}`,
    name: itemName || `AI_FILL_STOP_NAME_${position}`,
    description: itemDescription || 'AI_FILL_STOP_DESCRIPTION',
    image: itemImage,
    address: itemAddress,
    telephone: itemPhone,
    url: includeUrlFields ? itemWebsite : undefined,
    sameAs: includeUrlFields && itemInstagram ? [itemInstagram] : undefined,
    geo: itemGeo,
    priceRange: itemPriceRange,
    servesCuisine: cuisines.length > 0 ? cuisines : undefined,
    keywords: keywordParts.length > 0 ? keywordParts.join(', ') : undefined,
    provider:
      isManualStop && providerName
        ? {
            '@type': 'Organization',
            name: providerName
          }
        : undefined,
    departureLocation: isManualStop ? manualDetails?.startingPoint : undefined,
    itinerary:
      isManualStop && manualDetails && manualDetails.keyLocations.length > 0
        ? {
            '@type': 'ItemList',
            itemListElement: manualDetails.keyLocations.map(
              (location, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                item: location
              })
            )
          }
        : undefined
  }

  if (
    includeUrlFields &&
    !entity.url &&
    itemInstagram &&
    isValidAbsoluteHttpUrl(itemInstagram)
  ) {
    entity.url = itemInstagram
  }

  return compactValue(entity) as Record<string, unknown>
}
