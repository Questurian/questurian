import type { ListicleItineraryDraft } from '../../types'
import { getItineraryBlocksInArticleOrder } from '../../types'
import {
  asArray,
  getNodeType,
  isRecord,
  normalizeAbsoluteUrl,
  normalizeText,
  toFiniteNumber
} from '../../../../shared/builder/services/structured-data-template-core.service'
import { getItinerarySchemaPublisherConfig } from '../services/schema-config.service'
import {
  getAllowedSchemaTypesForItineraryBlockType,
  getSchemaTypeForItineraryBlockType
} from '../services/itinerary-stop-schema.service'

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
  const targetStatus =
    input.targetStatus ??
    (draft.payloadStatus === 'published' || draft.status === 'published'
      ? 'published'
      : 'draft')
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
    normalizeText(draft.payloadAuthorName) || publisherConfig.defaultAuthorName
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

  const blogPostingNode = graphNodes.find(
    (node) => getNodeType(node['@type']) === 'BlogPosting'
  )
  const tripNode = graphNodes.find((node) => {
    const nodeType = getNodeType(node['@type'])
    return nodeType === 'TouristTrip' || nodeType === 'Trip'
  })
  const itemListNode = graphNodes.find(
    (node) => getNodeType(node['@type']) === 'ItemList'
  )

  if (!blogPostingNode) {
    issues.push('Structured Data "@graph" must include a BlogPosting node.')
  }

  if (!tripNode) {
    issues.push('Structured Data "@graph" must include a TouristTrip node.')
  }

  if (!itemListNode) {
    issues.push('Structured Data "@graph" must include an ItemList node.')
    return issues
  }

  if (blogPostingNode) {
    if (normalizeText(blogPostingNode['@id']) !== expectedBlogPostingId) {
      issues.push(
        'Structured Data BlogPosting must use the canonical BlogPosting @id.'
      )
    }

    const aboutRef = isRecord(blogPostingNode.about)
      ? normalizeText(blogPostingNode.about['@id'])
      : undefined
    const mainEntityRef = isRecord(blogPostingNode.mainEntity)
      ? normalizeText(blogPostingNode.mainEntity['@id'])
      : undefined

    if (aboutRef !== expectedTripId) {
      issues.push(
        'Structured Data BlogPosting.about must reference the Trip @id.'
      )
    }

    if (mainEntityRef !== expectedTripId) {
      issues.push(
        'Structured Data BlogPosting.mainEntity must reference the Trip @id.'
      )
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
        issues.push(
          'Structured Data BlogPosting must include a valid ISO dateModified.'
        )
      }

      const datePublished = normalizeText(blogPostingNode.datePublished)
      if (!datePublished || Number.isNaN(new Date(datePublished).getTime())) {
        issues.push(
          'Structured Data BlogPosting must include a valid ISO datePublished.'
        )
      }

      if (canonicalUrl) {
        const mainEntityOfPage = isRecord(blogPostingNode.mainEntityOfPage)
          ? normalizeText(blogPostingNode.mainEntityOfPage['@id'])
          : undefined

        if (mainEntityOfPage !== canonicalUrl) {
          issues.push(
            'Structured Data BlogPosting.mainEntityOfPage must match the canonical URL.'
          )
        }
      }

      if (shouldRequireAuthor) {
        const author = isRecord(blogPostingNode.author)
          ? normalizeText(blogPostingNode.author.name)
          : undefined
        if (!author) {
          issues.push(
            'Structured Data BlogPosting must include an author name.'
          )
        }
      }

      if (publisherConfig.siteName) {
        const publisher = isRecord(blogPostingNode.publisher)
          ? normalizeText(blogPostingNode.publisher.name)
          : undefined
        if (!publisher) {
          issues.push(
            'Structured Data BlogPosting must include a publisher name.'
          )
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
  if (
    tripNode &&
    itemListId &&
    tripItineraryId &&
    itemListId !== tripItineraryId
  ) {
    issues.push(
      'Structured Data Trip.itinerary must reference the ItemList @id.'
    )
  }

  const tripId = getReferenceId(tripNode)
  const blogMainEntityId = getReferenceId(blogPostingNode?.mainEntity)
  if (
    blogPostingNode &&
    tripId &&
    blogMainEntityId &&
    tripId !== blogMainEntityId
  ) {
    issues.push(
      'Structured Data BlogPosting.mainEntity must reference the Trip @id.'
    )
  }

  const itemListElement = asArray(itemListNode.itemListElement)
  if (!itemListElement) {
    issues.push(
      'Structured Data ItemList must include an itemListElement array.'
    )
    return issues
  }

  const blocksInArticleOrder = getItineraryBlocksInArticleOrder(draft)
  if (itemListElement.length !== blocksInArticleOrder.length) {
    issues.push(
      `Structured Data ItemList must contain ${blocksInArticleOrder.length} ListItem entries.`
    )
  }

  for (let index = 0; index < itemListElement.length; index += 1) {
    const expectedPosition = index + 1
    const draftItem = blocksInArticleOrder[index]
    const entry = itemListElement[index]
    const listItem = isRecord(entry) ? entry : null

    if (!listItem) {
      issues.push(
        `Structured Data itemListElement[${index}] must be an object.`
      )
      continue
    }

    if (getNodeType(listItem['@type']) !== 'ListItem') {
      issues.push(
        `Structured Data itemListElement[${index}] must have "@type": "ListItem".`
      )
    }

    if (toFiniteNumber(listItem.position) !== expectedPosition) {
      issues.push(
        `Structured Data itemListElement[${index}] must have position ${expectedPosition}.`
      )
    }

    const itemEntity = isRecord(listItem.item) ? listItem.item : null
    if (!itemEntity) {
      issues.push(
        `Structured Data itemListElement[${index}] must include an item object.`
      )
      continue
    }

    const expectedType = draftItem
      ? getSchemaTypeForItineraryBlockType(draftItem.blockType)
      : 'Place'
    const allowedTypes = draftItem
      ? getAllowedSchemaTypesForItineraryBlockType(draftItem.blockType)
      : [expectedType]
    const entityTypes = getNodeTypes(itemEntity['@type'])
    const hasAllowedType = entityTypes.some((type) =>
      allowedTypes.includes(type)
    )
    if (!hasAllowedType) {
      issues.push(
        `Structured Data itemListElement[${index}].item must include an allowed "@type" for this stop. Prefer "${expectedType}".`
      )
    }

    if (!normalizeText(itemEntity.name)) {
      issues.push(
        `Structured Data itemListElement[${index}].item must include a non-empty name.`
      )
    }
  }

  return issues
}
