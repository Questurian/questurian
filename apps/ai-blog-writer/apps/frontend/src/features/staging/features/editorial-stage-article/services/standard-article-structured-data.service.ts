import {
  getSchemaPublisherConfig,
  type SchemaPublisherConfig,
} from '../../../../../shared/seo/services/schema-publisher-config.service'
import type { StagedArticle } from '../../../types'
import {
  STRUCTURED_DATA_DESCRIPTION_MAX_LENGTH,
  compactValue,
  normalizeAbsoluteUrl,
  normalizeText,
  stripMarkdown,
  toSchemaDate,
  toStructuredDataDescription,
} from './standard-article-seo.helpers'

export function buildStandardArticleContext(stagedArticle: StagedArticle): string {
  const body = stagedArticle.blocks
    .map((block) => block.content.trim())
    .filter(Boolean)
    .join('\n\n')

  return body || stagedArticle.content.trim()
}

type StandardArticleStructuredDataInput = {
  stagedArticle: StagedArticle
  locationLabel?: string
  publisherConfig?: SchemaPublisherConfig
}

export function buildLegacyStandardArticleStructuredDataTemplate(input: {
  stagedArticle: StagedArticle
  locationLabel?: string
}): Record<string, unknown> {
  const { stagedArticle, locationLabel } = input
  const articleBody = buildStandardArticleContext(stagedArticle)
  const summary = stripMarkdown(articleBody).slice(0, STRUCTURED_DATA_DESCRIPTION_MAX_LENGTH).trim() || 'AI_FILL_ARTICLE_DESCRIPTION'
  const canonicalUrl = normalizeAbsoluteUrl(stagedArticle.seoSection?.openGraph.url || '')
  const articleImageUrl = normalizeAbsoluteUrl(stagedArticle.seoSection?.openGraph.imageUrl || '')
    || normalizeAbsoluteUrl(stagedArticle.seoSection?.twitterCard.imageUrl || '')

  return Object.fromEntries(
    Object.entries({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: stagedArticle.title.trim() || 'AI_FILL_HEADLINE',
      name: stagedArticle.title.trim() || 'AI_FILL_HEADLINE',
      description: summary,
      articleSection: stagedArticle.originalType.trim() || undefined,
      contentLocation: locationLabel
        ? {
            '@type': 'Place',
            name: locationLabel,
          }
        : undefined,
      url: canonicalUrl,
      image: articleImageUrl,
      dateModified: stagedArticle.createdAt || undefined,
      mainEntityOfPage: canonicalUrl
        ? {
            '@type': 'WebPage',
            '@id': canonicalUrl,
          }
        : undefined,
    }).filter(([, entry]) => {
      if (entry === null || entry === undefined) return false
      if (typeof entry === 'string') return entry.trim().length > 0
      if (Array.isArray(entry)) return entry.length > 0
      return true
    }),
  )
}

export function buildStandardArticleStructuredDataTemplate(input: StandardArticleStructuredDataInput): Record<string, unknown> {
  const { stagedArticle, locationLabel } = input
  const publisherConfig = input.publisherConfig ?? getSchemaPublisherConfig()
  const articleTitle = stagedArticle.title.trim() || 'AI_FILL_HEADLINE'
  const articleContextMarkdown = buildStandardArticleContext(stagedArticle)
  const summary = toStructuredDataDescription(articleContextMarkdown) || 'AI_FILL_ARTICLE_DESCRIPTION'
  const canonicalUrl = normalizeAbsoluteUrl(stagedArticle.seoSection?.openGraph.url || '')
  const articleImageUrl = normalizeAbsoluteUrl(stagedArticle.seoSection?.openGraph.imageUrl || '')
    || normalizeAbsoluteUrl(stagedArticle.seoSection?.twitterCard.imageUrl || '')
  const schemaDateModified = toSchemaDate(stagedArticle.payloadUpdatedAt)
    || toSchemaDate(stagedArticle.createdAt)
  const schemaDatePublished = stagedArticle.payloadStatus === 'published'
    ? toSchemaDate(stagedArticle.payloadPublishedAt)
    : undefined
  const normalizedLocation = normalizeText(locationLabel)
  const placeId = canonicalUrl ? `${canonicalUrl}#standard-article-place` : '#standard-article-place'
  const blogPostingId = canonicalUrl ? `${canonicalUrl}#standard-article-blog-posting` : '#standard-article-blog-posting'
  const authorName = normalizeText(stagedArticle.payloadAuthorName) || publisherConfig?.defaultAuthorName

  const locationNode = normalizedLocation
    ? compactValue({
        '@type': 'Place',
        '@id': placeId,
        name: normalizedLocation,
      }) as Record<string, unknown>
    : undefined

  const blogPostingNode = compactValue({
    '@type': 'BlogPosting',
    '@id': blogPostingId,
    headline: articleTitle,
    name: articleTitle,
    description: summary,
    articleSection: normalizeText(stagedArticle.originalType),
    contentLocation: locationNode ? { '@id': placeId } : undefined,
    about: locationNode ? { '@id': placeId } : undefined,
    inLanguage: 'en',
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
    publisher: publisherConfig?.siteName
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
  }) as Record<string, unknown>

  return compactValue({
    '@context': 'https://schema.org',
    '@graph': [
      blogPostingNode,
      locationNode,
    ],
  }) as Record<string, unknown>
}

export function serializeStandardArticleStructuredDataTemplate(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2)
}

export function shouldAutoManageStandardArticleStructuredData(input: {
  existingStructuredData: string
  lastAutoStructuredData?: string
  nextStructuredData: string
  legacyStructuredData?: string
}): boolean {
  const existingStructuredData = input.existingStructuredData.trim()
  const lastAutoStructuredData = input.lastAutoStructuredData?.trim() || ''
  const nextStructuredData = input.nextStructuredData.trim()
  const legacyStructuredData = input.legacyStructuredData?.trim() || ''
  const hasAutoGeneratedBefore = Boolean(lastAutoStructuredData)

  return (
    (!existingStructuredData && !hasAutoGeneratedBefore)
    || existingStructuredData === lastAutoStructuredData
    || existingStructuredData === nextStructuredData
    || (!!legacyStructuredData && existingStructuredData === legacyStructuredData)
  )
}
