import type { SeoSection } from '../../../../../shared/seo/types'
import {
  getSchemaPublisherConfig,
  type SchemaPublisherConfig,
} from '../../../../../shared/seo/services/schema-publisher-config.service'
import { getSeoAiTargetLabel, type SeoAiTarget } from '../../../../../shared/seo/services/seo-ai.service'
import type { StagedArticle } from '../../../types'

const STRUCTURED_DATA_DESCRIPTION_MAX_LENGTH = 220

const isValidAbsoluteUrl = (value: string): boolean => {
  if (!value.trim()) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const stripMarkdown = (value: string): string => (
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

const withReadableMaxLength = (
  value: string | undefined,
  maxLength: number,
): string | undefined => {
  if (!value) return value
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed

  const sentenceCandidates = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  const sentenceFit = sentenceCandidates.find((candidate) => candidate.length <= maxLength)
  if (sentenceFit && sentenceFit.length >= Math.floor(maxLength * 0.6)) {
    return sentenceFit
  }

  const clipped = trimmed.slice(0, maxLength)
  const lastSpace = clipped.lastIndexOf(' ')
  const base = (lastSpace >= Math.floor(maxLength * 0.5) ? clipped.slice(0, lastSpace) : clipped).trim()
  return base.replace(/[,:;.\-–—\s]+$/g, '')
}

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

const normalizeAbsoluteUrl = (value: string): string | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return isValidAbsoluteUrl(trimmed) ? trimmed : undefined
}

const toStructuredDataDescription = (value: string): string | undefined => {
  const normalized = stripPromotionalLeadIn(stripMarkdown(value))
  if (!normalized) return undefined
  return withReadableMaxLength(normalized, STRUCTURED_DATA_DESCRIPTION_MAX_LENGTH)
}

const toSchemaDate = (value: string | undefined): string | undefined => {
  const normalized = normalizeText(value)
  if (!normalized) return undefined

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return undefined

  return parsed.toISOString()
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const asArray = (value: unknown): unknown[] | null => (
  Array.isArray(value) ? value : null
)

const compactValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return undefined

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? normalized : undefined
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => compactValue(entry))
      .filter((entry) => entry !== undefined)
    return normalized.length > 0 ? normalized : undefined
  }

  if (typeof value === 'object') {
    const normalizedEntries = Object.entries(value)
      .map(([entryKey, entryValue]) => [entryKey, compactValue(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined)

    return normalizedEntries.length > 0
      ? Object.fromEntries(normalizedEntries)
      : undefined
  }

  return value
}

const getNodeType = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  const valueArray = asArray(value)
  if (!valueArray || valueArray.length < 1) return null
  const first = valueArray[0]
  return typeof first === 'string' ? first : null
}

const getReferenceId = (value: unknown): string | undefined => {
  const record = asRecord(value)
  if (!record) return undefined
  return normalizeText(record['@id'])
}

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
    mainEntity: locationNode ? { '@id': placeId } : undefined,
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

function buildTargetShape(target: SeoAiTarget): string {
  switch (target) {
    case 'seoTitle':
      return '{"seoTitle":"string"}'
    case 'metaDescription':
      return '{"metaDescription":"string"}'
    case 'openGraph':
      return '{"openGraph":{"title":"string","description":"string"}}'
    case 'openGraphTitle':
      return '{"openGraph":{"title":"string"}}'
    case 'openGraphDescription':
      return '{"openGraph":{"description":"string"}}'
    case 'openGraphUrl':
      return '{"openGraph":{"url":"https://example.com/article"}}'
    case 'twitterCard':
      return '{"twitterCard":{"card":"summary|summary_large_image","title":"string","description":"string"}}'
    case 'twitterCardCard':
      return '{"twitterCard":{"card":"summary|summary_large_image"}}'
    case 'twitterCardTitle':
      return '{"twitterCard":{"title":"string"}}'
    case 'twitterCardDescription':
      return '{"twitterCard":{"description":"string"}}'
    case 'structuredData':
      return '{"structuredData":{"@context":"https://schema.org","@graph":[{"@type":"BlogPosting","headline":"string","description":"string","mainEntityOfPage":{"@type":"WebPage","@id":"string"}},{"@type":"Place","name":"string"}]}}'
    case 'robots':
      return '{"robots":{"index":"index|noindex","follow":"follow|nofollow"}}'
    case 'robotsIndex':
      return '{"robots":{"index":"index|noindex"}}'
    case 'robotsFollow':
      return '{"robots":{"follow":"follow|nofollow"}}'
    case 'all':
    default:
      return JSON.stringify({
        seoTitle: 'string',
        metaDescription: 'string',
        openGraph: {
          title: 'string',
          description: 'string',
        },
        twitterCard: {
          card: 'summary or summary_large_image',
          title: 'string',
          description: 'string',
        },
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'BlogPosting',
              headline: 'string',
              description: 'string',
              mainEntityOfPage: {
                '@type': 'WebPage',
                '@id': 'string',
              },
            },
            {
              '@type': 'Place',
              name: 'string',
            },
          ],
        },
        robots: {
          index: 'index or noindex',
          follow: 'follow or nofollow',
        },
      }, null, 2)
  }
}

export function buildStandardArticleSeoAiPrompt(input: {
  location?: string
  target?: SeoAiTarget
}): string {
  const target = input.target || 'all'
  const locationText = input.location?.trim() ? input.location.trim() : 'Unknown location'

  return [
    'Generate SEO metadata for the provided article context.',
    '',
    'Rules:',
    '- Use the article context as the source of truth.',
    '- Return ONLY valid JSON (no markdown, no commentary).',
    '- Do NOT include image fields.',
    '- Only generate the requested target. Omit unrelated keys.',
    '- seoTitle must be <= 60 characters and keyword-rich.',
    '- metaDescription should be compelling and around 150-160 characters.',
    '- openGraph and twitter should align with the article and be share-ready.',
    '- structuredData must be a JSON object (JSON-LD style).',
    '- If structuredData is requested, preserve the existing structuredData shape from input block content.',
    '- If structuredData is requested, keep @graph with BlogPosting as the primary node.',
    '- If structuredData is requested and location data exists, preserve the Place node plus BlogPosting contentLocation/about/mainEntity references to the Place @id.',
    '- If structuredData is requested, do not add articleBody or wordCount to BlogPosting.',
    '- If structuredData is requested, preserve author and publisher nodes when present.',
    `- If structuredData is requested, keep every "description" concise and factual (max ${STRUCTURED_DATA_DESCRIPTION_MAX_LENGTH} chars).`,
    '- If structuredData is requested, avoid marketing tone, keyword stuffing, and sales language.',
    '- robots should usually be index/follow unless context suggests otherwise.',
    '',
    'Article type: standard article',
    `Location: ${locationText}`,
    `Target: ${getSeoAiTargetLabel(target)}`,
    '',
    'Return this exact shape:',
    buildTargetShape(target),
  ].join('\n')
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

export function isSeoCoreComplete(seoSection: SeoSection): boolean {
  return Boolean(seoSection.seoTitle.trim() && seoSection.metaDescription.trim())
}

export function validateStandardArticleSeoSection(input: {
  seoSection: SeoSection
  locationLabel?: string
}): string[] {
  const { seoSection, locationLabel } = input
  const issues: string[] = []

  if (!isValidAbsoluteUrl(seoSection.openGraph.imageUrl)) {
    issues.push('Open Graph image URL must be a valid absolute URL.')
  }

  if (!isValidAbsoluteUrl(seoSection.openGraph.url)) {
    issues.push('Open Graph URL must be a valid absolute URL.')
  }

  if (!isValidAbsoluteUrl(seoSection.twitterCard.imageUrl)) {
    issues.push('Twitter image URL must be a valid absolute URL.')
  }

  const structuredDataInput = seoSection.structuredData.trim()
  if (!structuredDataInput) return issues

  try {
    const parsed = JSON.parse(structuredDataInput)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      issues.push('Structured Data must be a valid JSON object.')
      return issues
    }

    const context = parsed['@context']
    if (context !== 'https://schema.org' && context !== 'http://schema.org') {
      issues.push('Structured Data must use "@context": "https://schema.org".')
    }

    const graph = asArray(parsed['@graph'])
    if (!graph) {
      issues.push('Structured Data must include an "@graph" array.')
      return issues
    }

    const graphNodes = graph
      .map((node) => asRecord(node))
      .filter((node): node is Record<string, unknown> => Boolean(node))

    const blogPostingNode = graphNodes.find((node) => getNodeType(node['@type']) === 'BlogPosting')
    if (!blogPostingNode) {
      issues.push('Structured Data "@graph" must include a BlogPosting node.')
    }

    if (normalizeText(locationLabel)) {
      const placeNode = graphNodes.find((node) => getNodeType(node['@type']) === 'Place')
      if (!placeNode) {
        issues.push('Structured Data "@graph" must include a Place node when a location is set.')
        return issues
      }

      const placeId = getReferenceId(placeNode)
      if (!placeId) {
        issues.push('Structured Data Place node must include an "@id".')
      }

      const contentLocationId = getReferenceId(blogPostingNode?.contentLocation)
      const aboutId = getReferenceId(blogPostingNode?.about)
      const mainEntityId = getReferenceId(blogPostingNode?.mainEntity)

      if (!contentLocationId) {
        issues.push('Structured Data BlogPosting.contentLocation must reference the Place @id.')
      }

      if (!aboutId) {
        issues.push('Structured Data BlogPosting.about must reference the Place @id.')
      }

      if (!mainEntityId) {
        issues.push('Structured Data BlogPosting.mainEntity must reference the Place @id.')
      }

      if (placeId && contentLocationId && contentLocationId !== placeId) {
        issues.push('Structured Data BlogPosting.contentLocation must reference the Place @id.')
      }

      if (placeId && aboutId && aboutId !== placeId) {
        issues.push('Structured Data BlogPosting.about must reference the Place @id.')
      }

      if (placeId && mainEntityId && mainEntityId !== placeId) {
        issues.push('Structured Data BlogPosting.mainEntity must reference the Place @id.')
      }
    }
  } catch {
    issues.push('Structured Data must be valid JSON.')
  }

  return issues
}
