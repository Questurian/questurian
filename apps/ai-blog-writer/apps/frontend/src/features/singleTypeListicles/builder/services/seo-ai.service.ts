import {
  applySeoAiPatch,
  buildSeoAiSeed,
  getSeoAiTargetLabel,
  parseSeoAiPatch,
  type SeoAiTarget,
} from '../../../../shared/seo/services/seo-ai.service'

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

function parseStructuredDataTemplate(template: string | undefined): Record<string, unknown> | undefined {
  const trimmed = template?.trim()
  if (!trimmed) return undefined

  try {
    const parsed = JSON.parse(trimmed)
    return asRecord(parsed) || undefined
  } catch {
    return undefined
  }
}

function summarizeStructuredDataTemplate(template: string | undefined): {
  itemCount?: number
  itemType?: string
} {
  const parsedTemplate = parseStructuredDataTemplate(template)
  if (!parsedTemplate) return {}

  const graph = Array.isArray(parsedTemplate['@graph']) ? parsedTemplate['@graph'] : null
  if (!graph) return {}

  const itemListNode = graph.find((node) => {
    const record = asRecord(node)
    if (!record) return false
    const type = record['@type']
    if (typeof type === 'string') return type === 'ItemList'
    if (Array.isArray(type)) return type.includes('ItemList')
    return false
  })

  const itemListRecord = asRecord(itemListNode)
  if (!itemListRecord) return {}

  const itemListElement = Array.isArray(itemListRecord.itemListElement)
    ? itemListRecord.itemListElement
    : []
  const firstListItem = asRecord(itemListElement[0])
  const firstItemEntity = firstListItem ? asRecord(firstListItem.item) : null
  const itemType = firstItemEntity && typeof firstItemEntity['@type'] === 'string'
    ? firstItemEntity['@type']
    : undefined

  return {
    itemCount: itemListElement.length,
    itemType,
  }
}

function buildTargetShape(target: SeoAiTarget): string {
  switch (target) {
    case 'seoTitle':
      return '{"seoTitle":"string"}'
    case 'metaDescription':
      return '{"metaDescription":"string"}'
    case 'openGraph':
      return '{"openGraph":{"title":"string","description":"string","url":"https://example.com/path"}}'
    case 'openGraphTitle':
      return '{"openGraph":{"title":"string"}}'
    case 'openGraphDescription':
      return '{"openGraph":{"description":"string"}}'
    case 'openGraphUrl':
      return '{"openGraph":{"url":"https://example.com/path"}}'
    case 'twitterCard':
      return '{"twitterCard":{"card":"summary|summary_large_image","title":"string","description":"string"}}'
    case 'twitterCardCard':
      return '{"twitterCard":{"card":"summary|summary_large_image"}}'
    case 'twitterCardTitle':
      return '{"twitterCard":{"title":"string"}}'
    case 'twitterCardDescription':
      return '{"twitterCard":{"description":"string"}}'
    case 'structuredData':
      return '{"structuredData":{"@context":"https://schema.org","@graph":[{"@type":"BlogPosting"},{"@type":"ItemList","itemListElement":[{"@type":"ListItem","position":1,"item":{"@type":"Place","name":"string"}}]}]}}'
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
          url: 'https://example.com/path',
        },
        twitterCard: {
          card: 'summary or summary_large_image',
          title: 'string',
          description: 'string',
        },
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'BlogPosting' },
            {
              '@type': 'ItemList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  item: { '@type': 'Place', name: 'string' },
                },
              ],
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

export function buildSeoAiPrompt(input: {
  articleType: string
  location?: string
  target?: SeoAiTarget
  structuredDataTemplate?: string
}): string {
  const locationText = input.location?.trim() ? input.location.trim() : 'Unknown location'
  const target = input.target || 'all'
  const shouldIncludeStructuredTemplate = (
    (target === 'all' || target === 'structuredData')
    && Boolean(input.structuredDataTemplate?.trim())
  )
  const templateSummary = shouldIncludeStructuredTemplate
    ? summarizeStructuredDataTemplate(input.structuredDataTemplate)
    : {}
  const lines = [
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
    '- If structuredData is requested, only refine values and optional fields; do not remove required nodes.',
    '- If structuredData is requested, preserve author, publisher, image, datePublished, dateModified, and mainEntityOfPage when present.',
    '- If structuredData is requested, keep every "description" concise and factual (max 220 chars).',
    '- If structuredData is requested, avoid marketing tone, keyword stuffing, and sales language.',
    '- robots should usually be index/follow unless context suggests otherwise.',
    '',
    `Article type: ${input.articleType}`,
    `Location: ${locationText}`,
    `Target: ${getSeoAiTargetLabel(target)}`,
  ]

  if (shouldIncludeStructuredTemplate) {
    if (typeof templateSummary.itemCount === 'number') {
      lines.push(`Structured data item count to preserve: ${templateSummary.itemCount}`)
    }
    if (templateSummary.itemType) {
      lines.push(`Structured data item @type to preserve: ${templateSummary.itemType}`)
    }
    lines.push('Keep @graph with BlogPosting + ItemList.')
    lines.push('Preserve article metadata fields on BlogPosting when they already exist.')
  }

  if (shouldIncludeStructuredTemplate && lines.join('\n').length > 1400) {
    return [
      'Generate SEO metadata for the provided article context.',
      '',
      'Rules:',
      '- Return ONLY valid JSON (no markdown, no commentary).',
      '- Only generate the requested target. Omit unrelated keys.',
      '- If structuredData is requested, preserve existing structuredData shape from input block content.',
      '- Keep @graph with BlogPosting + ItemList and preserve ordered list positions.',
      '- Preserve BlogPosting author, publisher, image, dates, and mainEntityOfPage when present.',
      '',
      `Article type: ${input.articleType}`,
      `Location: ${locationText}`,
      `Target: ${getSeoAiTargetLabel(target)}`,
      typeof templateSummary.itemCount === 'number'
        ? `Structured data item count to preserve: ${templateSummary.itemCount}`
        : '',
      templateSummary.itemType ? `Structured data item @type to preserve: ${templateSummary.itemType}` : '',
      '',
      'Return this exact shape:',
      buildTargetShape(target),
    ].filter(Boolean).join('\n')
  }

  if (shouldIncludeStructuredTemplate) {
    lines.push('Do not change list length unless source context requires it.')
  }

  lines.push(
    '',
    'Return this exact shape:',
    buildTargetShape(target),
  )

  return lines.join('\n')
}

export {
  applySeoAiPatch,
  buildSeoAiSeed,
  getSeoAiTargetLabel,
  parseSeoAiPatch,
}

export type { SeoAiTarget }
