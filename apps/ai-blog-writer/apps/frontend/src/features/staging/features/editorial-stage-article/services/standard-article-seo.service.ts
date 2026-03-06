import type { SeoSection } from '../../../../shared/seo/types'
import { getSeoAiTargetLabel, type SeoAiTarget } from '../../../../shared/seo/services/seo-ai.service'
import type { StagedArticle } from '../../../types'

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

const normalizeAbsoluteUrl = (value: string): string | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return isValidAbsoluteUrl(trimmed) ? trimmed : undefined
}

const compactRecord = (value: Record<string, unknown>): Record<string, unknown> => (
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null || entry === undefined) return false
      if (typeof entry === 'string') return entry.trim().length > 0
      if (Array.isArray(entry)) return entry.length > 0
      return true
    }),
  )
)

export function buildStandardArticleContext(stagedArticle: StagedArticle): string {
  const body = stagedArticle.blocks
    .map((block) => block.content.trim())
    .filter(Boolean)
    .join('\n\n')

  return body || stagedArticle.content.trim()
}

export function buildStandardArticleStructuredDataTemplate(input: {
  stagedArticle: StagedArticle
  locationLabel?: string
}): Record<string, unknown> {
  const { stagedArticle, locationLabel } = input
  const articleBody = buildStandardArticleContext(stagedArticle)
  const summary = stripMarkdown(articleBody).slice(0, 220).trim() || 'AI_FILL_ARTICLE_DESCRIPTION'
  const canonicalUrl = normalizeAbsoluteUrl(stagedArticle.seoSection?.openGraph.url || '')
  const articleImageUrl = normalizeAbsoluteUrl(stagedArticle.seoSection?.openGraph.imageUrl || '')
    || normalizeAbsoluteUrl(stagedArticle.seoSection?.twitterCard.imageUrl || '')

  return compactRecord({
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
  })
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
      return '{"openGraph":{"title":"string","description":"string","url":"https://example.com/article"}}'
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
      return '{"structuredData":{"@context":"https://schema.org","@type":"BlogPosting","headline":"string","description":"string"}}'
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
          url: 'https://example.com/article',
        },
        twitterCard: {
          card: 'summary or summary_large_image',
          title: 'string',
          description: 'string',
        },
        structuredData: {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: 'string',
          description: 'string',
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
    '- If structuredData is requested, preserve the existing BlogPosting shape from input block content.',
    '- If structuredData is requested, keep @type as BlogPosting.',
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

export function isSeoCoreComplete(seoSection: SeoSection): boolean {
  return Boolean(seoSection.seoTitle.trim() && seoSection.metaDescription.trim())
}

export function validateStandardArticleSeoSection(seoSection: SeoSection): string[] {
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
    }
  } catch {
    issues.push('Structured Data must be valid JSON.')
  }

  return issues
}
