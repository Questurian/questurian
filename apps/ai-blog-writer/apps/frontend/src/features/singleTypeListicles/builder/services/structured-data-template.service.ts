import type {
  ListicleItemBlock,
  ListicleType,
  RelatedItemOption,
  SingleTypeListicleDraft,
} from '../../types'
import {
  getSchemaPublisherConfig,
  type SchemaPublisherConfig,
} from '../../../shared/seo/services/schema-publisher-config.service'
import {
  asArray,
  compactValue,
  extractDraftText,
  getNodeType,
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
  toFiniteNumber,
  toSchemaDate,
  toStructuredDescription,
} from '../../../shared/builder/services/structured-data-template-core.service'

export { serializeStructuredDataTemplate } from '../../../shared/builder/services/structured-data-template-core.service'

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
  const itemDescription = toStructuredDescription(
    extractDraftText(listicleItem.blurbMarkdown, listicleItem.blurbJsonText),
  )
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
  publisherConfig?: SchemaPublisherConfig
}): Record<string, unknown> {
  const { draft, relatedItems } = input
  const publisherConfig = input.publisherConfig ?? getSchemaPublisherConfig()
  const schemaType = getSchemaTypeForListicleType(draft.listicleType) || 'Place'
  const canonicalUrl = normalizeAbsoluteUrl(draft.seoSection.openGraph.url)
  const blogPostingId = canonicalUrl
    ? `${canonicalUrl}#single-type-listicle-blog-posting`
    : '#single-type-listicle-blog-posting'
  const resolvedStatus = draft.payloadStatus === 'published' || draft.status === 'published'
    ? 'published'
    : 'draft'
  const schemaDateModified = toSchemaDate(draft.payloadUpdatedAt || draft.updatedAt)
  const schemaDatePublished = resolvedStatus === 'published'
    ? toSchemaDate(draft.payloadPublishedAt || draft.updatedAt)
    : undefined
  const articleImageUrl = normalizeAbsoluteUrl(draft.seoSection.openGraph.imageUrl)
    || normalizeAbsoluteUrl(draft.seoSection.twitterCard.imageUrl)
  const itemListId = canonicalUrl
    ? `${canonicalUrl}#single-type-listicle-item-list`
    : '#single-type-listicle-item-list'
  const articleTitle = draft.title.trim() || 'AI_FILL_HEADLINE'
  const intro = toStructuredDescription(
    extractDraftText(draft.header.introMarkdown, draft.header.introJsonText),
  )
  const listicleLabel = getListicleTypeLabel(draft.listicleType)
  const authorName = normalizeText(draft.payloadAuthorName) || publisherConfig.defaultAuthorName

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
    '@id': itemListId,
    name: `${articleTitle} ranked list`,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: draft.items.length,
    itemListElement,
  }

  const blogPostingNode: Record<string, unknown> = {
    '@type': 'BlogPosting',
    '@id': blogPostingId,
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
      '@id': itemListId,
    },
    mainEntity: {
      '@type': 'ItemList',
      '@id': itemListId,
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
    '@graph': [blogPostingNode, itemListNode],
  }

  return compactValue(payload) as Record<string, unknown>
}

export function validateSingleTypeListicleStructuredDataShape(input: {
  structuredData: Record<string, unknown>
  draft: SingleTypeListicleDraft
  targetStatus?: 'draft' | 'published'
}): string[] {
  const { structuredData, draft } = input
  const issues: string[] = []
  const targetStatus = input.targetStatus ?? draft.status
  const publisherConfig = getSchemaPublisherConfig()
  const canonicalUrl = normalizeAbsoluteUrl(draft.seoSection.openGraph.url)
  const expectedBlogPostingId = canonicalUrl
    ? `${canonicalUrl}#single-type-listicle-blog-posting`
    : '#single-type-listicle-blog-posting'
  const expectedItemListId = canonicalUrl
    ? `${canonicalUrl}#single-type-listicle-item-list`
    : '#single-type-listicle-item-list'
  const shouldRequireAuthor = Boolean(
    normalizeText(draft.payloadAuthorName) || publisherConfig.defaultAuthorName,
  )

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

  if (blogPostingNode) {
    if (normalizeText(blogPostingNode['@id']) !== expectedBlogPostingId) {
      issues.push('Structured Data BlogPosting must use the canonical BlogPosting @id.')
    }

    const aboutRef = isRecord(blogPostingNode.about) ? normalizeText(blogPostingNode.about['@id']) : undefined
    const mainEntityRef = isRecord(blogPostingNode.mainEntity) ? normalizeText(blogPostingNode.mainEntity['@id']) : undefined

    if (aboutRef !== expectedItemListId) {
      issues.push('Structured Data BlogPosting.about must reference the ItemList @id.')
    }

    if (mainEntityRef !== expectedItemListId) {
      issues.push('Structured Data BlogPosting.mainEntity must reference the ItemList @id.')
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

  if (normalizeText(itemListNode['@id']) !== expectedItemListId) {
    issues.push('Structured Data ItemList must use the canonical ItemList @id.')
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
