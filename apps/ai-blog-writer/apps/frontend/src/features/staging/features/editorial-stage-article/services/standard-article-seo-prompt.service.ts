import { getSeoAiTargetLabel, type SeoAiTarget } from '../../../../../shared/seo/services/seo-ai.service'
import { STRUCTURED_DATA_DESCRIPTION_MAX_LENGTH } from './standard-article-seo.helpers'

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
    '- If structuredData is requested and location data exists, preserve the Place node plus BlogPosting contentLocation/about references to the Place @id.',
    '- If structuredData is requested, do not add a mainEntity reference to the Place; the article itself is the main entity of the page.',
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
