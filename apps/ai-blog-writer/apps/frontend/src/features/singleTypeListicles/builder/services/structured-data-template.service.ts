import type {
  ListicleItemBlock,
  ListicleType,
  RelatedItemOption,
  SingleTypeListicleDraft,
} from '../../types'
import {
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  resolveImageUrl,
  resolveInstagramPermalink,
} from '../utils/item-media.utils'

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

export const LISTICLE_ITEM_SCHEMA_TYPE: Record<ListicleType, string> = {
  dining: 'Restaurant',
  accommodations: 'LodgingBusiness',
  attractions: 'TouristAttraction',
  nightlife: 'NightClub',
}

function getListicleTypeLabel(type: ListicleType | ''): string {
  switch (type) {
    case 'dining':
      return 'Dining'
    case 'accommodations':
      return 'Accommodations'
    case 'attractions':
      return 'Attractions'
    case 'nightlife':
      return 'Nightlife'
    default:
      return 'Listicle'
  }
}

export function getSchemaTypeForListicleType(type: ListicleType | ''): string | null {
  if (!type) return null
  return LISTICLE_ITEM_SCHEMA_TYPE[type]
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
  listicleItem: ListicleItemBlock,
  relatedItem: RelatedItemOption,
): string | undefined {
  const photoById = new Map<number, string>()
  getRelatedPhotoObjects(relatedItem).forEach((photo) => {
    const url = resolveImageUrl(photo)
    if (!url) return
    photoById.set(photo.id, url)
  })

  for (const photoId of listicleItem.selectedPhotos) {
    const selected = photoById.get(photoId)
    if (selected) return selected
  }

  for (const candidate of photoById.values()) {
    return candidate
  }

  return undefined
}

function resolveSelectedInstagramPermalink(
  listicleItem: ListicleItemBlock,
  relatedItem: RelatedItemOption,
): string | undefined {
  if (!listicleItem.selectedInstagramPost) return undefined
  const selectedPost = getRelatedInstagramPostObjects(relatedItem)
    .find((post) => post.id === listicleItem.selectedInstagramPost)
  if (!selectedPost) return undefined
  return resolveInstagramPermalink(selectedPost)
}

function buildRankedItemEntity(input: {
  listicleItem: ListicleItemBlock
  relatedItem?: RelatedItemOption
  position: number
  schemaType: string
  includeUrlFields: boolean
}): Record<string, unknown> {
  const {
    listicleItem,
    relatedItem,
    position,
    schemaType,
    includeUrlFields,
  } = input
  const source = relatedItem && isRecord(relatedItem) ? relatedItem : null
  const itemName = source ? resolveEntityName(source) : undefined
  const itemDescription = extractDraftText(listicleItem.blurbMarkdown, listicleItem.blurbJsonText)
  const itemAddress = source ? resolveEntityAddress(source) : undefined
  const itemWebsite = source ? resolveEntityWebsite(source) : undefined
  const itemPhone = source ? resolveEntityPhone(source) : undefined
  const itemPriceRange = source ? resolveEntityPriceRange(source) : undefined
  const itemTypeLabel = source ? resolveEntityTypeLabel(source) : undefined
  const itemGeo = source ? resolveEntityGeo(source) : undefined
  const itemImage = relatedItem ? resolveSelectedImageUrl(listicleItem, relatedItem) : undefined
  const itemInstagram = relatedItem ? resolveSelectedInstagramPermalink(listicleItem, relatedItem) : undefined
  const cuisines = source ? pickStringArray(source, [['cuisines']]) : []
  const idealFor = source ? pickStringArray(source, [['idealFor'], ['nightlifeDetails', 'core', 'idealFor']]) : []

  const entity: Record<string, unknown> = {
    '@type': schemaType,
    identifier: listicleItem.item ?? `item-${position}`,
    name: itemName || `AI_FILL_ITEM_NAME_${position}`,
    description: itemDescription || 'AI_FILL_ITEM_DESCRIPTION',
    image: itemImage,
    address: itemAddress,
    telephone: itemPhone,
    url: includeUrlFields ? itemWebsite : undefined,
    sameAs: includeUrlFields && itemInstagram ? [itemInstagram] : undefined,
    geo: itemGeo,
    priceRange: itemPriceRange,
    servesCuisine: cuisines.length > 0 ? cuisines : undefined,
    keywords: idealFor.length > 0 ? idealFor.join(', ') : undefined,
    category: itemTypeLabel,
  }

  if (includeUrlFields && !entity.url && itemInstagram && isValidAbsoluteHttpUrl(itemInstagram)) {
    entity.url = itemInstagram
  }

  return compactValue(entity) as Record<string, unknown>
}

export function buildSingleTypeListicleStructuredDataTemplate(input: {
  draft: SingleTypeListicleDraft
  relatedItems: RelatedItemOption[]
}): Record<string, unknown> {
  const { draft, relatedItems } = input
  const schemaType = getSchemaTypeForListicleType(draft.listicleType) || 'Place'
  const canonicalUrl = normalizeAbsoluteUrl(draft.seoSection.openGraph.url)
  const articleTitle = draft.title.trim() || 'AI_FILL_HEADLINE'
  const intro = extractDraftText(draft.header.introMarkdown, draft.header.introJsonText)
  const listicleLabel = getListicleTypeLabel(draft.listicleType)

  const relatedById = new Map<number, RelatedItemOption>(
    relatedItems.map((entry) => [entry.id, entry]),
  )

  const itemListElement = draft.items.map((listicleItem, index) => {
    const position = index + 1
    const relatedItem = listicleItem.item ? relatedById.get(listicleItem.item) : undefined
    const rankedEntity = buildRankedItemEntity({
      listicleItem,
      relatedItem,
      position,
      schemaType,
      includeUrlFields: Boolean(canonicalUrl),
    })

    return {
      '@type': 'ListItem',
      position,
      name: rankedEntity.name,
      item: rankedEntity,
    }
  })

  const itemListNode: Record<string, unknown> = {
    '@type': 'ItemList',
    '@id': '#single-type-listicle-item-list',
    name: `${articleTitle} ranked list`,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: draft.items.length,
    itemListElement,
  }

  const blogPostingNode: Record<string, unknown> = {
    '@type': 'BlogPosting',
    '@id': '#single-type-listicle-blog-posting',
    headline: articleTitle,
    name: articleTitle,
    description: intro || 'AI_FILL_ARTICLE_DESCRIPTION',
    articleSection: listicleLabel,
    contentLocation: draft.location.trim()
      ? {
          '@type': 'Place',
          name: draft.location.trim(),
        }
      : undefined,
    about: {
      '@id': '#single-type-listicle-item-list',
    },
    mainEntity: {
      '@id': '#single-type-listicle-item-list',
    },
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl
      ? {
          '@type': 'WebPage',
          '@id': canonicalUrl,
        }
      : undefined,
  }

  const payload = {
    '@context': 'https://schema.org',
    '@graph': [blogPostingNode, itemListNode],
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

export function validateSingleTypeListicleStructuredDataShape(input: {
  structuredData: Record<string, unknown>
  draft: SingleTypeListicleDraft
}): string[] {
  const { structuredData, draft } = input
  const issues: string[] = []

  const expectedItemType = getSchemaTypeForListicleType(draft.listicleType)
  if (!expectedItemType) {
    issues.push('Structured Data validation requires a selected listicle type.')
    return issues
  }

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
  const itemListNode = graphNodes.find((node) => getNodeType(node['@type']) === 'ItemList')

  if (!blogPostingNode) {
    issues.push('Structured Data "@graph" must include a BlogPosting node.')
  }

  if (!itemListNode) {
    issues.push('Structured Data "@graph" must include an ItemList node.')
    return issues
  }

  const itemListElement = asArray(itemListNode.itemListElement)
  if (!itemListElement) {
    issues.push('Structured Data ItemList must include an itemListElement array.')
    return issues
  }

  if (itemListElement.length !== draft.items.length) {
    issues.push(`Structured Data ItemList must contain ${draft.items.length} ListItem entries.`)
  }

  for (let index = 0; index < itemListElement.length; index += 1) {
    const expectedPosition = index + 1
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

    if (getNodeType(itemEntity['@type']) !== expectedItemType) {
      issues.push(`Structured Data itemListElement[${index}].item must have "@type": "${expectedItemType}".`)
    }

    if (!normalizeText(itemEntity.name)) {
      issues.push(`Structured Data itemListElement[${index}].item must include a non-empty name.`)
    }
  }

  return issues
}
