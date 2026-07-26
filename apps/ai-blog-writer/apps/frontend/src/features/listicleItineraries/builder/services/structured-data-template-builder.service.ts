import type {
  InstagramPostOption,
  ItineraryBlockType,
  ListicleItineraryDraft,
  MediaAssetOption,
  RelatedItemOption
} from '../../types'
import { getItineraryBlocksInArticleOrder } from '../../types'
import {
  compactValue,
  extractDraftText,
  normalizeAbsoluteUrl,
  normalizeText,
  toSchemaDate,
  toStructuredDescription
} from '../../../../shared/builder/services/structured-data-template-core.service'
import {
  getItinerarySchemaPublisherConfig,
  type ItinerarySchemaPublisherConfig
} from './schema-config.service'
import { buildItineraryStopEntity } from './itinerary-stop-entity.service'
import { getItineraryStopTypeLabel } from './itinerary-stop-schema.service'

const toHumanReadableLocationName = (
  value: string | undefined
): string | undefined => {
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

export function buildListicleItineraryStructuredDataTemplate(input: {
  draft: ListicleItineraryDraft
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  mediaAssets?: MediaAssetOption[]
  instagramPosts?: InstagramPostOption[]
  publisherConfig?: ItinerarySchemaPublisherConfig
}): Record<string, unknown> {
  const {
    draft,
    relatedByBlockType,
    mediaAssets = [],
    instagramPosts = []
  } = input
  const publisherConfig =
    input.publisherConfig ?? getItinerarySchemaPublisherConfig()
  const canonicalUrl = normalizeAbsoluteUrl(draft.seoSection.openGraph.url)
  const blogPostingId = canonicalUrl
    ? `${canonicalUrl}#listicle-itinerary-blog-posting`
    : '#listicle-itinerary-blog-posting'
  const resolvedStatus =
    draft.payloadStatus === 'published' || draft.status === 'published'
      ? 'published'
      : 'draft'
  const schemaDateModified = toSchemaDate(
    draft.payloadUpdatedAt || draft.updatedAt
  )
  const schemaDatePublished =
    resolvedStatus === 'published'
      ? toSchemaDate(draft.payloadPublishedAt || draft.updatedAt)
      : undefined
  const articleImageUrl =
    normalizeAbsoluteUrl(draft.seoSection.openGraph.imageUrl) ||
    normalizeAbsoluteUrl(draft.seoSection.twitterCard.imageUrl)
  const tripId = canonicalUrl
    ? `${canonicalUrl}#listicle-itinerary-trip`
    : '#listicle-itinerary-trip'
  const itemListId = canonicalUrl
    ? `${canonicalUrl}#listicle-itinerary-stop-list`
    : '#listicle-itinerary-stop-list'
  const articleTitle = draft.title.trim() || 'AI_FILL_HEADLINE'
  const contentLocationName = toHumanReadableLocationName(draft.location)
  const intro = toStructuredDescription(
    extractDraftText(draft.header.introMarkdown, draft.header.introJsonText)
  )
  const authorName =
    normalizeText(draft.payloadAuthorName) || publisherConfig.defaultAuthorName

  const blocksInArticleOrder = getItineraryBlocksInArticleOrder(draft)
  const itemListElement = blocksInArticleOrder.map((itineraryItem, index) => {
    const position = index + 1
    const relatedItem = (
      relatedByBlockType[itineraryItem.blockType] || []
    ).find((entry) => entry.id === itineraryItem.item)
    const stopEntity = buildItineraryStopEntity({
      itineraryItem,
      relatedItem,
      mediaAssets,
      instagramPosts,
      relatedByBlockType,
      position,
      includeUrlFields: Boolean(canonicalUrl)
    })

    const segmentLabel =
      itineraryItem.blockType === 'itinerary-where-staying'
        ? `${getItineraryStopTypeLabel(itineraryItem.blockType)} ${position}`
        : `${getItineraryStopTypeLabel(itineraryItem.blockType)} stop ${position}`

    return {
      '@type': 'ListItem',
      position,
      name: segmentLabel,
      item: stopEntity
    }
  })

  const itemListNode: Record<string, unknown> = {
    '@type': 'ItemList',
    '@id': itemListId,
    name: `${articleTitle} itinerary (lodging and stops)`,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: blocksInArticleOrder.length,
    itemListElement
  }

  const tripNode: Record<string, unknown> = {
    '@type': 'TouristTrip',
    '@id': tripId,
    name: articleTitle,
    description: intro || 'AI_FILL_TRIP_DESCRIPTION',
    itinerary: {
      '@id': itemListId
    },
    url: canonicalUrl
  }

  const blogPostingNode: Record<string, unknown> = {
    '@type': 'BlogPosting',
    '@id': blogPostingId,
    headline: articleTitle,
    name: articleTitle,
    description: intro || 'AI_FILL_ARTICLE_DESCRIPTION',
    articleSection: 'Itinerary',
    inLanguage: 'en',
    contentLocation: contentLocationName
      ? {
          '@type': 'Place',
          name: contentLocationName
        }
      : undefined,
    about: {
      '@id': tripId
    },
    mainEntity: {
      '@type': 'TouristTrip',
      '@id': tripId
    },
    url: canonicalUrl,
    image: articleImageUrl,
    dateModified: schemaDateModified,
    datePublished: schemaDatePublished,
    mainEntityOfPage: canonicalUrl
      ? {
          '@type': 'WebPage',
          '@id': canonicalUrl
        }
      : undefined,
    author: authorName
      ? {
          '@type': 'Person',
          name: authorName
        }
      : undefined,
    publisher: publisherConfig.siteName
      ? {
          '@type': 'Organization',
          name: publisherConfig.siteName,
          logo: publisherConfig.logoUrl
            ? {
                '@type': 'ImageObject',
                url: publisherConfig.logoUrl
              }
            : undefined
        }
      : undefined
  }

  const payload = {
    '@context': 'https://schema.org',
    '@graph': [blogPostingNode, tripNode, itemListNode]
  }

  return compactValue(payload) as Record<string, unknown>
}
