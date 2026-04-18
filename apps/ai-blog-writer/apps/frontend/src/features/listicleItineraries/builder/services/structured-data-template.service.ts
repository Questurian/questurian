import type {
  InstagramPostOption,
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  MediaAssetOption,
  RelatedItemOption,
} from '../../types'
import {
  getItineraryBlocksInArticleOrder,
  isManualItineraryBlockType,
  relatedCollectionToBlockType,
} from '../../types'
import {
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  resolveImageUrl,
  resolveInstagramPermalink,
} from '../utils/item-media.utils'
import {
  getItinerarySchemaPublisherConfig,
  type ItinerarySchemaPublisherConfig,
} from './schema-config.service'

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const asArray = (value: unknown): unknown[] | null => (
  Array.isArray(value) ? value : null
)

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

const isLatitude = (value: number | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90
)

const isLongitude = (value: number | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180
)

const isValidAbsoluteHttpUrl = (value: string): boolean => {
  if (!value.trim()) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const normalizeAbsoluteUrl = (value: unknown): string | undefined => {
  const normalized = normalizeText(value)
  if (!normalized) return undefined
  return isValidAbsoluteHttpUrl(normalized) ? normalized : undefined
}

const toSchemaDate = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

const toHumanReadableLocationName = (value: string | undefined): string | undefined => {
  const normalized = normalizeText(value)
  if (!normalized) return undefined
  if (!normalized.includes('|')) return normalized

  const parts = normalized
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length < 1) return undefined

  return parts.reverse().join(', ')
}

const getNestedValue = (source: Record<string, unknown>, path: string[]): unknown => {
  let cursor: unknown = source
  for (const part of path) {
    if (!isRecord(cursor)) return undefined
    cursor = cursor[part]
  }
  return cursor
}

const pickFirstText = (source: Record<string, unknown>, paths: string[][]): string | undefined => {
  for (const path of paths) {
    const value = getNestedValue(source, path)
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return undefined
}

const pickStringArray = (source: Record<string, unknown>, paths: string[][]): string[] => {
  for (const path of paths) {
    const value = getNestedValue(source, path)
    const arrayValue = asArray(value)
    if (!arrayValue) continue
    const normalized = arrayValue
      .map((entry) => normalizeText(entry))
      .filter((entry): entry is string => Boolean(entry))
    if (normalized.length > 0) return normalized
  }
  return []
}

function extractLexicalText(value: unknown): string {
  const chunks: string[] = []

  const visit = (node: unknown) => {
    if (typeof node === 'string') {
      const normalized = node.trim()
      if (normalized) chunks.push(normalized)
      return
    }

    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (!isRecord(node)) return

    if (typeof node.text === 'string') {
      const normalized = node.text.trim()
      if (normalized) chunks.push(normalized)
    }

    Object.values(node).forEach(visit)
  }

  visit(value)

  const deduped = chunks.filter((value, index) => chunks.indexOf(value) === index)
  return deduped.join(' ').replace(/\s+/g, ' ').trim()
}

const extractDraftText = (markdown: string, lexicalJson?: string): string => {
  const markdownText = markdown.trim()
  if (markdownText) return markdownText

  const lexicalInput = (lexicalJson || '').trim()
  if (!lexicalInput) return ''

  try {
    const parsed = JSON.parse(lexicalInput)
    return extractLexicalText(parsed)
  } catch {
    return ''
  }
}

const STRUCTURED_DESCRIPTION_MAX_LENGTH = 220

const stripMarkdownSyntax = (value: string): string => (
  value
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
    .replace(/[*_~>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
)

const stripPromotionalLeadIn = (value: string): string => {
  const leadInPatterns = [
    /^discover\s+/i,
    /^explore\s+/i,
    /^experience\s+/i,
    /^enjoy\s+/i,
    /^visit\s+/i,
  ]

  for (const pattern of leadInPatterns) {
    if (pattern.test(value)) {
      return value.replace(pattern, '').trim()
    }
  }

  return value
}

const clipReadableText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value

  const sentenceCandidates = value
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  const sentenceFit = sentenceCandidates.find((candidate) => candidate.length <= maxLength)
  if (sentenceFit && sentenceFit.length >= Math.floor(maxLength * 0.6)) {
    return sentenceFit
  }

  const clipped = value.slice(0, maxLength)
  const lastSpace = clipped.lastIndexOf(' ')
  const base = (lastSpace >= Math.floor(maxLength * 0.5) ? clipped.slice(0, lastSpace) : clipped).trim()
  return base.replace(/[,:;.\-–—\s]+$/g, '')
}

function toStructuredDescription(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = stripPromotionalLeadIn(stripMarkdownSyntax(value))
  if (!normalized) return undefined
  return clipReadableText(normalized, STRUCTURED_DESCRIPTION_MAX_LENGTH)
}

const compactValue = (value: unknown): unknown => {
  if (value === undefined || value === null) return undefined

  if (Array.isArray(value)) {
    const compactedArray = value
      .map((entry) => compactValue(entry))
      .filter((entry) => entry !== undefined)
    return compactedArray
  }

  if (!isRecord(value)) return value

  const compactedRecord = Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, compactValue(entry)])
      .filter(([, entry]) => (
        entry !== undefined
        && !(Array.isArray(entry) && entry.length < 1)
        && !(isRecord(entry) && Object.keys(entry).length < 1)
      )),
  )

  return compactedRecord
}

const PRICE_LEVEL_TO_RANGE: Record<string, string> = {
  '1': '$',
  '2': '$$',
  '3': '$$$',
  '4': '$$$$',
}

const normalizePriceRange = (rawValue: string | undefined): string | undefined => {
  if (!rawValue) return undefined
  const trimmed = rawValue.trim()
  if (!trimmed) return undefined
  if (/^\$+$/.test(trimmed)) return trimmed
  return PRICE_LEVEL_TO_RANGE[trimmed] || trimmed
}

export const ITINERARY_STOP_SCHEMA_TYPE: Record<ItineraryBlockType, string> = {
  'itinerary-dining': 'Restaurant',
  'itinerary-accommodations': 'LodgingBusiness',
  'itinerary-where-staying': 'LodgingBusiness',
  'itinerary-attractions': 'TouristAttraction',
  'itinerary-nightlife': 'NightClub',
  'itinerary-key-location': 'Place',
  'itinerary-tour-agency': 'TouristTrip',
}

const ITINERARY_STOP_ALLOWED_SCHEMA_TYPES: Record<ItineraryBlockType, string[]> = {
  'itinerary-dining': [
    'Restaurant',
    'FoodEstablishment',
    'CafeOrCoffeeShop',
    'IceCreamShop',
    'Bakery',
    'FastFoodRestaurant',
  ],
  'itinerary-accommodations': [
    'LodgingBusiness',
    'Hotel',
    'Hostel',
    'BedAndBreakfast',
    'Resort',
  ],
  'itinerary-where-staying': [
    'LodgingBusiness',
    'Hotel',
    'Hostel',
    'BedAndBreakfast',
    'Resort',
  ],
  'itinerary-attractions': [
    'TouristAttraction',
    'Place',
  ],
  'itinerary-nightlife': [
    'NightClub',
    'BarOrPub',
    'EntertainmentBusiness',
    'LocalBusiness',
  ],
  'itinerary-key-location': [
    'Place',
    'LocalBusiness',
  ],
  'itinerary-tour-agency': [
    'TouristTrip',
    'Trip',
    'Service',
    'TravelAgency',
  ],
}

function getStopTypeLabel(blockType: ItineraryBlockType): string {
  switch (blockType) {
    case 'itinerary-dining':
      return 'Dining'
    case 'itinerary-accommodations':
      return 'Accommodations'
    case 'itinerary-where-staying':
      return "Where You're Staying"
    case 'itinerary-attractions':
      return 'Attractions'
    case 'itinerary-nightlife':
      return 'Nightlife'
    case 'itinerary-key-location':
      return 'Key Location'
    case 'itinerary-tour-agency':
      return 'Tour Agency'
    default:
      return 'Stop'
  }
}

export function getSchemaTypeForItineraryBlockType(blockType: ItineraryBlockType): string {
  return ITINERARY_STOP_SCHEMA_TYPE[blockType] || 'Place'
}

function getAllowedSchemaTypesForItineraryBlockType(blockType: ItineraryBlockType): string[] {
  return ITINERARY_STOP_ALLOWED_SCHEMA_TYPES[blockType] || ['Place']
}

function resolveEntityName(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['title'],
    ['core', 'name'],
    ['nightlifeDetails', 'core', 'name'],
  ])
}

function resolveEntityAddress(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['address'],
    ['theDetails', 'address'],
  ])
}

function resolveEntityWebsite(source: Record<string, unknown>): string | undefined {
  const candidate = pickFirstText(source, [
    ['website'],
    ['theDetails', 'websiteUrl'],
    ['theDetails', 'bookingUrl'],
    ['theDetails', 'googleMapsUrl'],
  ])
  return candidate ? normalizeAbsoluteUrl(candidate) : undefined
}

function resolveEntityPhone(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['phoneNumber'],
    ['theDetails', 'phone'],
  ])
}

function resolveEntityPriceRange(source: Record<string, unknown>): string | undefined {
  const candidate = pickFirstText(source, [
    ['priceLevel'],
    ['core', 'price'],
    ['nightlifeDetails', 'core', 'priceTier'],
    ['attractionsDetails', 'core', 'pricing'],
  ])
  return normalizePriceRange(candidate)
}

function resolveEntityTypeLabel(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['type'],
    ['core', 'type'],
    ['core', 'clubType'],
    ['attractionsDetails', 'core', 'attractionType'],
  ])
}

function resolveEntityGeo(source: Record<string, unknown>): Record<string, unknown> | undefined {
  const latitude = toFiniteNumber(source.latitude)
  const longitude = toFiniteNumber(source.longitude)
  if (latitude === undefined || longitude === undefined) return undefined

  return {
    '@type': 'GeoCoordinates',
    latitude,
    longitude,
  }
}

function resolveSelectedImageUrl(
  itineraryItem: ItineraryItemBlock,
  relatedItem: RelatedItemOption,
): string | undefined {
  const photoById = new Map<number, string>()
  getRelatedPhotoObjects(relatedItem).forEach((photo) => {
    const url = resolveImageUrl(photo)
    if (!url) return
    photoById.set(photo.id, url)
  })

  for (const photoId of itineraryItem.selectedPhotos) {
    const selected = photoById.get(photoId)
    if (selected) return selected
  }

  for (const candidate of photoById.values()) {
    return candidate
  }

  return undefined
}

function resolveSelectedInstagramPermalink(
  itineraryItem: ItineraryItemBlock,
  relatedItem: RelatedItemOption,
): string | undefined {
  if (!itineraryItem.selectedInstagramPost) return undefined
  const selectedPost = getRelatedInstagramPostObjects(relatedItem)
    .find((post) => post.id === itineraryItem.selectedInstagramPost)
  if (!selectedPost) return undefined
  return resolveInstagramPermalink(selectedPost)
}

function resolveManualImageUrl(
  itineraryItem: ItineraryItemBlock,
  mediaAssets: MediaAssetOption[],
): string | undefined {
  if (!itineraryItem.image) return undefined
  const selectedAsset = mediaAssets.find((asset) => asset.id === itineraryItem.image)
  return selectedAsset ? resolveImageUrl(selectedAsset) : undefined
}

function resolveManualInstagramPermalink(
  itineraryItem: ItineraryItemBlock,
  instagramPosts: InstagramPostOption[],
): string | undefined {
  if (!itineraryItem.instagramPost) return undefined
  const selectedPost = instagramPosts.find((post) => post.id === itineraryItem.instagramPost)
  return selectedPost ? resolveInstagramPermalink(selectedPost) : undefined
}

function resolveManualStartingPoint(itineraryItem: ItineraryItemBlock): Record<string, unknown> | undefined {
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
      longitude,
    },
  }) as Record<string, unknown>
}

function buildManualKeyLocationEntities(
  itineraryItem: ItineraryItemBlock,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): Array<Record<string, unknown>> {
  return itineraryItem.keyLocations
    .map((location) => {
      if (location.source === 'existing') {
        if (!location.relatedCollection || !location.relatedItem) {
          return null
        }

        const blockType = relatedCollectionToBlockType(location.relatedCollection)
        const relatedItem = (relatedByBlockType[blockType] || [])
          .find((entry) => entry.id === location.relatedItem)
        if (!relatedItem || !isRecord(relatedItem)) {
          return null
        }

        return compactValue({
          '@type': 'Place',
          name: resolveEntityName(relatedItem) || normalizeText(relatedItem.title),
          geo: resolveEntityGeo(relatedItem),
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
        geo: latitude !== undefined && longitude !== undefined
          ? {
              '@type': 'GeoCoordinates',
              latitude,
              longitude,
            }
          : undefined,
      }) as Record<string, unknown>
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
}

function buildStopEntity(input: {
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
    includeUrlFields,
  } = input
  const isManualStop = isManualItineraryBlockType(itineraryItem.blockType)
  const source = relatedItem && isRecord(relatedItem) ? relatedItem : null
  const schemaType = getSchemaTypeForItineraryBlockType(itineraryItem.blockType)
  const itemName = isManualStop
    ? normalizeText(itineraryItem.title)
    : source
      ? resolveEntityName(source)
      : undefined
  const itemDescription = toStructuredDescription(
    extractDraftText(itineraryItem.blurbMarkdown, itineraryItem.blurbJsonText),
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
    ? resolveManualImageUrl(itineraryItem, mediaAssets)
    : relatedItem
      ? resolveSelectedImageUrl(itineraryItem, relatedItem)
      : undefined
  const itemInstagram = isManualStop
    ? resolveManualInstagramPermalink(itineraryItem, instagramPosts)
    : relatedItem
      ? resolveSelectedInstagramPermalink(itineraryItem, relatedItem)
      : undefined
  const cuisines = source ? pickStringArray(source, [['cuisines']]) : []
  const idealFor = source ? pickStringArray(source, [['idealFor'], ['nightlifeDetails', 'core', 'idealFor']]) : []
  const providerName = normalizeText(itineraryItem.operator)
  const startingPoint = resolveManualStartingPoint(itineraryItem)
  const keyLocationEntities = buildManualKeyLocationEntities(itineraryItem, relatedByBlockType)
  const keyLocationKeywords = keyLocationEntities
    .map((location) => normalizeText(location.name))
    .filter((location): location is string => Boolean(location))

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
    keywords: isManualStop
      ? keyLocationKeywords.join(', ') || undefined
      : idealFor.length > 0
        ? idealFor.join(', ')
        : undefined,
    category: itemTypeLabel || getStopTypeLabel(itineraryItem.blockType),
    provider: isManualStop && providerName
      ? {
          '@type': 'Organization',
          name: providerName,
        }
      : undefined,
    departureLocation: isManualStop ? startingPoint : undefined,
    itinerary: isManualStop && keyLocationEntities.length > 0
      ? {
          '@type': 'ItemList',
          itemListElement: keyLocationEntities.map((location, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: location,
          })),
        }
      : undefined,
  }

  if (includeUrlFields && !entity.url && itemInstagram && isValidAbsoluteHttpUrl(itemInstagram)) {
    entity.url = itemInstagram
  }

  return compactValue(entity) as Record<string, unknown>
}

export function buildListicleItineraryStructuredDataTemplate(input: {
  draft: ListicleItineraryDraft
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  mediaAssets?: MediaAssetOption[]
  instagramPosts?: InstagramPostOption[]
  publisherConfig?: ItinerarySchemaPublisherConfig
}): Record<string, unknown> {
  const { draft, relatedByBlockType, mediaAssets = [], instagramPosts = [] } = input
  const publisherConfig = input.publisherConfig ?? getItinerarySchemaPublisherConfig()
  const canonicalUrl = normalizeAbsoluteUrl(draft.seoSection.openGraph.url)
  const blogPostingId = canonicalUrl
    ? `${canonicalUrl}#listicle-itinerary-blog-posting`
    : '#listicle-itinerary-blog-posting'
  const resolvedStatus = draft.payloadStatus === 'published' || draft.status === 'published'
    ? 'published'
    : 'draft'
  const schemaDateModified = toSchemaDate(draft.payloadUpdatedAt || draft.updatedAt)
  const schemaDatePublished = resolvedStatus === 'published'
    ? toSchemaDate(draft.payloadPublishedAt || draft.updatedAt)
    : undefined
  const articleImageUrl = normalizeAbsoluteUrl(draft.seoSection.openGraph.imageUrl)
    || normalizeAbsoluteUrl(draft.seoSection.twitterCard.imageUrl)
  const tripId = canonicalUrl ? `${canonicalUrl}#listicle-itinerary-trip` : '#listicle-itinerary-trip'
  const itemListId = canonicalUrl ? `${canonicalUrl}#listicle-itinerary-stop-list` : '#listicle-itinerary-stop-list'
  const articleTitle = draft.title.trim() || 'AI_FILL_HEADLINE'
  const contentLocationName = toHumanReadableLocationName(draft.location)
  const intro = toStructuredDescription(
    extractDraftText(draft.header.introMarkdown, draft.header.introJsonText),
  )
  const authorName = normalizeText(draft.payloadAuthorName) || publisherConfig.defaultAuthorName

  const blocksInArticleOrder = getItineraryBlocksInArticleOrder(draft)
  const itemListElement = blocksInArticleOrder.map((itineraryItem, index) => {
    const position = index + 1
    const relatedItem = (relatedByBlockType[itineraryItem.blockType] || [])
      .find((entry) => entry.id === itineraryItem.item)
    const stopEntity = buildStopEntity({
      itineraryItem,
      relatedItem,
      mediaAssets,
      instagramPosts,
      relatedByBlockType,
      position,
      includeUrlFields: Boolean(canonicalUrl),
    })

    const segmentLabel = itineraryItem.blockType === 'itinerary-where-staying'
      ? `${getStopTypeLabel(itineraryItem.blockType)} ${position}`
      : `${getStopTypeLabel(itineraryItem.blockType)} stop ${position}`

    return {
      '@type': 'ListItem',
      position,
      name: segmentLabel,
      item: stopEntity,
    }
  })

  const itemListNode: Record<string, unknown> = {
    '@type': 'ItemList',
    '@id': itemListId,
    name: `${articleTitle} itinerary (lodging and stops)`,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: blocksInArticleOrder.length,
    itemListElement,
  }

  const tripNode: Record<string, unknown> = {
    '@type': 'Trip',
    '@id': tripId,
    name: articleTitle,
    description: intro || 'AI_FILL_TRIP_DESCRIPTION',
    itinerary: {
      '@id': itemListId,
    },
    url: canonicalUrl,
  }

  const blogPostingNode: Record<string, unknown> = {
    '@type': 'BlogPosting',
    '@id': blogPostingId,
    headline: articleTitle,
    name: articleTitle,
    description: intro || 'AI_FILL_ARTICLE_DESCRIPTION',
    articleSection: 'Itinerary',
    contentLocation: contentLocationName
      ? {
          '@type': 'Place',
          name: contentLocationName,
        }
      : undefined,
    about: {
      '@id': tripId,
    },
    mainEntity: {
      '@type': 'Trip',
      '@id': tripId,
    },
    url: canonicalUrl,
    image: articleImageUrl,
    dateModified: schemaDateModified,
    datePublished: schemaDatePublished,
    mainEntityOfPage: canonicalUrl
      ? {
          '@type': 'WebPage',
          '@id': canonicalUrl,
        }
      : undefined,
    author: authorName
      ? {
          '@type': 'Person',
          name: authorName,
        }
      : undefined,
    publisher: publisherConfig.siteName
      ? {
          '@type': 'Organization',
          name: publisherConfig.siteName,
          logo: publisherConfig.logoUrl
            ? {
                '@type': 'ImageObject',
                url: publisherConfig.logoUrl,
              }
            : undefined,
        }
      : undefined,
  }

  const payload = {
    '@context': 'https://schema.org',
    '@graph': [blogPostingNode, tripNode, itemListNode],
  }

  return compactValue(payload) as Record<string, unknown>
}

export function serializeStructuredDataTemplate(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2)
}

const getNodeType = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  const typeArray = asArray(value)
  if (!typeArray || typeArray.length < 1) return null
  const first = typeArray[0]
  return typeof first === 'string' ? first : null
}

const getNodeTypes = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  const typeArray = asArray(value)
  if (!typeArray || typeArray.length < 1) return []
  return typeArray.filter((entry): entry is string => typeof entry === 'string')
}

const getReferenceId = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined
  const id = value['@id']
  return typeof id === 'string' ? id : undefined
}

export function validateListicleItineraryStructuredDataShape(input: {
  structuredData: Record<string, unknown>
  draft: ListicleItineraryDraft
  targetStatus?: 'draft' | 'published'
}): string[] {
  const { structuredData, draft } = input
  const issues: string[] = []
  const targetStatus = input.targetStatus ?? (
    draft.payloadStatus === 'published' || draft.status === 'published'
      ? 'published'
      : 'draft'
  )
  const publisherConfig = getItinerarySchemaPublisherConfig()
  const canonicalUrl = normalizeAbsoluteUrl(draft.seoSection.openGraph.url)
  const expectedBlogPostingId = canonicalUrl
    ? `${canonicalUrl}#listicle-itinerary-blog-posting`
    : '#listicle-itinerary-blog-posting'
  const expectedTripId = canonicalUrl
    ? `${canonicalUrl}#listicle-itinerary-trip`
    : '#listicle-itinerary-trip'
  const expectedItemListId = canonicalUrl
    ? `${canonicalUrl}#listicle-itinerary-stop-list`
    : '#listicle-itinerary-stop-list'
  const shouldRequireAuthor = Boolean(
    normalizeText(draft.payloadAuthorName) || publisherConfig.defaultAuthorName,
  )

  const context = structuredData['@context']
  if (context !== 'https://schema.org' && context !== 'http://schema.org') {
    issues.push('Structured Data must use "@context": "https://schema.org".')
  }

  const graph = asArray(structuredData['@graph'])
  if (!graph) {
    issues.push('Structured Data must include an "@graph" array.')
    return issues
  }

  const graphNodes = graph
    .map((node) => (isRecord(node) ? node : null))
    .filter((node): node is Record<string, unknown> => Boolean(node))

  const blogPostingNode = graphNodes.find((node) => getNodeType(node['@type']) === 'BlogPosting')
  const tripNode = graphNodes.find((node) => getNodeType(node['@type']) === 'Trip')
  const itemListNode = graphNodes.find((node) => getNodeType(node['@type']) === 'ItemList')

  if (!blogPostingNode) {
    issues.push('Structured Data "@graph" must include a BlogPosting node.')
  }

  if (!tripNode) {
    issues.push('Structured Data "@graph" must include a Trip node.')
  }

  if (!itemListNode) {
    issues.push('Structured Data "@graph" must include an ItemList node.')
    return issues
  }

  if (blogPostingNode) {
    if (normalizeText(blogPostingNode['@id']) !== expectedBlogPostingId) {
      issues.push('Structured Data BlogPosting must use the canonical BlogPosting @id.')
    }

    const aboutRef = isRecord(blogPostingNode.about) ? normalizeText(blogPostingNode.about['@id']) : undefined
    const mainEntityRef = isRecord(blogPostingNode.mainEntity) ? normalizeText(blogPostingNode.mainEntity['@id']) : undefined

    if (aboutRef !== expectedTripId) {
      issues.push('Structured Data BlogPosting.about must reference the Trip @id.')
    }

    if (mainEntityRef !== expectedTripId) {
      issues.push('Structured Data BlogPosting.mainEntity must reference the Trip @id.')
    }

    if (targetStatus === 'published') {
      if (!normalizeText(blogPostingNode.headline)) {
        issues.push('Structured Data BlogPosting must include a headline.')
      }

      if (!normalizeText(blogPostingNode.image)) {
        issues.push('Structured Data BlogPosting must include an image URL.')
      }

      const dateModified = normalizeText(blogPostingNode.dateModified)
      if (!dateModified || Number.isNaN(new Date(dateModified).getTime())) {
        issues.push('Structured Data BlogPosting must include a valid ISO dateModified.')
      }

      const datePublished = normalizeText(blogPostingNode.datePublished)
      if (!datePublished || Number.isNaN(new Date(datePublished).getTime())) {
        issues.push('Structured Data BlogPosting must include a valid ISO datePublished.')
      }

      if (canonicalUrl) {
        const mainEntityOfPage = isRecord(blogPostingNode.mainEntityOfPage)
          ? normalizeText(blogPostingNode.mainEntityOfPage['@id'])
          : undefined

        if (mainEntityOfPage !== canonicalUrl) {
          issues.push('Structured Data BlogPosting.mainEntityOfPage must match the canonical URL.')
        }
      }

      if (shouldRequireAuthor) {
        const author = isRecord(blogPostingNode.author) ? normalizeText(blogPostingNode.author.name) : undefined
        if (!author) {
          issues.push('Structured Data BlogPosting must include an author name.')
        }
      }

      if (publisherConfig.siteName) {
        const publisher = isRecord(blogPostingNode.publisher) ? normalizeText(blogPostingNode.publisher.name) : undefined
        if (!publisher) {
          issues.push('Structured Data BlogPosting must include a publisher name.')
        }
      }
    }
  }

  if (tripNode && normalizeText(tripNode['@id']) !== expectedTripId) {
    issues.push('Structured Data Trip must use the canonical Trip @id.')
  }

  if (normalizeText(itemListNode['@id']) !== expectedItemListId) {
    issues.push('Structured Data ItemList must use the canonical ItemList @id.')
  }

  const itemListId = getReferenceId(itemListNode)
  const tripItineraryId = getReferenceId(tripNode?.itinerary)
  if (tripNode && itemListId && tripItineraryId && itemListId !== tripItineraryId) {
    issues.push('Structured Data Trip.itinerary must reference the ItemList @id.')
  }

  const tripId = getReferenceId(tripNode)
  const blogMainEntityId = getReferenceId(blogPostingNode?.mainEntity)
  if (blogPostingNode && tripId && blogMainEntityId && tripId !== blogMainEntityId) {
    issues.push('Structured Data BlogPosting.mainEntity must reference the Trip @id.')
  }

  const itemListElement = asArray(itemListNode.itemListElement)
  if (!itemListElement) {
    issues.push('Structured Data ItemList must include an itemListElement array.')
    return issues
  }

  const blocksInArticleOrder = getItineraryBlocksInArticleOrder(draft)
  if (itemListElement.length !== blocksInArticleOrder.length) {
    issues.push(`Structured Data ItemList must contain ${blocksInArticleOrder.length} ListItem entries.`)
  }

  for (let index = 0; index < itemListElement.length; index += 1) {
    const expectedPosition = index + 1
    const draftItem = blocksInArticleOrder[index]
    const entry = itemListElement[index]
    const listItem = isRecord(entry) ? entry : null

    if (!listItem) {
      issues.push(`Structured Data itemListElement[${index}] must be an object.`)
      continue
    }

    if (getNodeType(listItem['@type']) !== 'ListItem') {
      issues.push(`Structured Data itemListElement[${index}] must have "@type": "ListItem".`)
    }

    if (toFiniteNumber(listItem.position) !== expectedPosition) {
      issues.push(`Structured Data itemListElement[${index}] must have position ${expectedPosition}.`)
    }

    const itemEntity = isRecord(listItem.item) ? listItem.item : null
    if (!itemEntity) {
      issues.push(`Structured Data itemListElement[${index}] must include an item object.`)
      continue
    }

    const expectedType = draftItem ? getSchemaTypeForItineraryBlockType(draftItem.blockType) : 'Place'
    const allowedTypes = draftItem
      ? getAllowedSchemaTypesForItineraryBlockType(draftItem.blockType)
      : [expectedType]
    const entityTypes = getNodeTypes(itemEntity['@type'])
    const hasAllowedType = entityTypes.some((type) => allowedTypes.includes(type))
    if (!hasAllowedType) {
      issues.push(
        `Structured Data itemListElement[${index}].item must include an allowed "@type" for this stop. Prefer "${expectedType}".`,
      )
    }

    if (!normalizeText(itemEntity.name)) {
      issues.push(`Structured Data itemListElement[${index}].item must include a non-empty name.`)
    }
  }

  return issues
}
