import {
  applySeoAiPatch,
  buildSeoAiSeed,
  getSeoAiTargetLabel,
  parseSeoAiPatch,
  type SeoAiTarget,
} from '../../../shared/seo/services/seo-ai.service'

const STRUCTURED_DATA_DESCRIPTION_MAX_LENGTH = 220

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

  return {
    itemCount: itemListElement.length,
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
      return '{"structuredData":{"@context":"https://schema.org","@graph":[{"@type":"BlogPosting","headline":"string","description":"string","datePublished":"2026-03-07T21:54:32.290Z","dateModified":"2026-03-07T22:16:16.572Z","author":{"@type":"Person","name":"string"},"publisher":{"@type":"Organization","name":"string"},"mainEntityOfPage":{"@type":"WebPage","@id":"https://example.com/path"}},{"@type":"Trip"},{"@type":"ItemList","itemListElement":[{"@type":"ListItem","position":1,"item":{"@type":"Place","name":"string"}}]}]}}'
    case 'robots':
      return '{"robots":{"index":"index|noindex","follow":"follow|nofollow"}}'
    case 'robotsIndex':
      return '{"robots":{"index":"index|noindex"}}'
    case 'robotsFollow':
      return '{"robots":{"follow":"follow|nofollow"}}'
    case 'all':
    default:
      return [
        '{',
        '  "seoTitle": "string",',
        '  "metaDescription": "string",',
        '  "openGraph": {',
        '    "title": "string",',
        '    "description": "string",',
        '    "url": "https://example.com/path"',
        '  },',
        '  "twitterCard": {',
        '    "card": "summary or summary_large_image",',
        '    "title": "string",',
        '    "description": "string"',
        '  },',
        '  "robots": {',
        '    "index": "index or noindex",',
        '    "follow": "follow or nofollow"',
        '  }',
        '}',
      ].join('\n')
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
    target === 'structuredData'
    && Boolean(input.structuredDataTemplate?.trim())
  )
  const includesStructuredDataTarget = target === 'structuredData'
  const templateSummary = shouldIncludeStructuredTemplate
    ? summarizeStructuredDataTemplate(input.structuredDataTemplate)
    : {}

  const lines = [
    'Generate SEO metadata for the provided itinerary article context.',
    '',
    'Rules:',
    '- Use the article context as the source of truth.',
    '- Return ONLY valid JSON (no markdown, no commentary).',
    '- Do NOT include image fields.',
    '- Only generate the requested target. Omit unrelated keys.',
    '- seoTitle must be <= 60 characters and keyword-rich.',
    '- metaDescription should be compelling and around 150-160 characters.',
    '- openGraph and twitter should align with the article and be share-ready.',
    '- robots should usually be index/follow unless context suggests otherwise.',
    '',
    `Article type: ${input.articleType}`,
    `Location: ${locationText}`,
    `Target: ${getSeoAiTargetLabel(target)}`,
  ]

  if (includesStructuredDataTarget) {
    lines.push(
      '- structuredData must be a JSON object (JSON-LD style).',
      '- If structuredData is requested, preserve the existing structuredData shape from input block content.',
      '- If structuredData is requested, keep @graph nodes for BlogPosting + Trip + ItemList and preserve stop order.',
      '- If structuredData is requested, preserve BlogPosting author, publisher, image, datePublished, dateModified, url, and mainEntityOfPage when present.',
      '- If structuredData is requested, preserve canonical @id relationships between BlogPosting, Trip, and ItemList.',
      '- If structuredData is requested, do not invent new stop entity types; keep existing item @type values unless explicitly required by context.',
      `- If structuredData is requested, keep every "description" concise and factual (max ${STRUCTURED_DATA_DESCRIPTION_MAX_LENGTH} chars).`,
      '- If structuredData is requested, avoid marketing tone, keyword stuffing, and sales language.',
    )
  }

  if (shouldIncludeStructuredTemplate && typeof templateSummary.itemCount === 'number') {
    lines.push(`Structured data stop count to preserve: ${templateSummary.itemCount}`)
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
