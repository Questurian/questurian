import type { SeoSection } from '../../types'

type SeoFieldKey =
  | 'seoTitle'
  | 'metaDescription'
  | 'openGraphTitle'
  | 'openGraphDescription'
  | 'openGraphUrl'
  | 'twitterCardCard'
  | 'twitterCardTitle'
  | 'twitterCardDescription'
  | 'structuredData'
  | 'robotsIndex'
  | 'robotsFollow'

export type SeoAiTarget =
  | 'all'
  | 'seoTitle'
  | 'metaDescription'
  | 'openGraph'
  | 'openGraphTitle'
  | 'openGraphDescription'
  | 'openGraphUrl'
  | 'twitterCard'
  | 'twitterCardCard'
  | 'twitterCardTitle'
  | 'twitterCardDescription'
  | 'structuredData'
  | 'robots'
  | 'robotsIndex'
  | 'robotsFollow'

type SeoAiPatch = {
  seoTitle?: string
  metaDescription?: string
  openGraph?: {
    title?: string
    description?: string
    url?: string
  }
  twitterCard?: {
    card?: SeoSection['twitterCard']['card']
    title?: string
    description?: string
  }
  structuredData?: string
  robots?: {
    index?: SeoSection['robots']['index']
    follow?: SeoSection['robots']['follow']
  }
}

const ALL_FIELDS: SeoFieldKey[] = [
  'seoTitle',
  'metaDescription',
  'openGraphTitle',
  'openGraphDescription',
  'openGraphUrl',
  'twitterCardCard',
  'twitterCardTitle',
  'twitterCardDescription',
  'structuredData',
  'robotsIndex',
  'robotsFollow',
]

const TARGET_FIELDS: Record<SeoAiTarget, SeoFieldKey[]> = {
  all: ALL_FIELDS,
  seoTitle: ['seoTitle'],
  metaDescription: ['metaDescription'],
  openGraph: ['openGraphTitle', 'openGraphDescription', 'openGraphUrl'],
  openGraphTitle: ['openGraphTitle'],
  openGraphDescription: ['openGraphDescription'],
  openGraphUrl: ['openGraphUrl'],
  twitterCard: ['twitterCardCard', 'twitterCardTitle', 'twitterCardDescription'],
  twitterCardCard: ['twitterCardCard'],
  twitterCardTitle: ['twitterCardTitle'],
  twitterCardDescription: ['twitterCardDescription'],
  structuredData: ['structuredData'],
  robots: ['robotsIndex', 'robotsFollow'],
  robotsIndex: ['robotsIndex'],
  robotsFollow: ['robotsFollow'],
}

const TARGET_LABELS: Record<SeoAiTarget, string> = {
  all: 'SEO metadata',
  seoTitle: 'SEO title',
  metaDescription: 'meta description',
  openGraph: 'Open Graph section',
  openGraphTitle: 'Open Graph title',
  openGraphDescription: 'Open Graph description',
  openGraphUrl: 'Open Graph URL',
  twitterCard: 'Twitter Card section',
  twitterCardCard: 'Twitter Card type',
  twitterCardTitle: 'Twitter title',
  twitterCardDescription: 'Twitter description',
  structuredData: 'structured data',
  robots: 'robots section',
  robotsIndex: 'robots index',
  robotsFollow: 'robots follow',
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

const withMaxLength = (value: string | undefined, maxLength: number): string | undefined => {
  if (!value) return value
  return value.length > maxLength ? value.slice(0, maxLength) : value
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

const normalizeTwitterCard = (value: unknown): SeoSection['twitterCard']['card'] | undefined => {
  if (value === 'summary' || value === 'summary_large_image') return value
  return undefined
}

const normalizeRobotIndex = (value: unknown): SeoSection['robots']['index'] | undefined => {
  if (value === 'index' || value === 'noindex') return value
  return undefined
}

const normalizeRobotFollow = (value: unknown): SeoSection['robots']['follow'] | undefined => {
  if (value === 'follow' || value === 'nofollow') return value
  return undefined
}

const isValidAbsoluteUrl = (value: string): boolean => {
  if (!value.trim()) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function extractJsonPayload(value: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('AI returned empty SEO response.')
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const directCandidate = fencedMatch?.[1]?.trim() || trimmed

  try {
    const parsed = JSON.parse(directCandidate)
    const record = asRecord(parsed)
    if (record) return record
  } catch {
    // Continue to bracket extraction fallback.
  }

  const start = directCandidate.indexOf('{')
  const end = directCandidate.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('AI did not return valid SEO JSON.')
  }

  try {
    const parsed = JSON.parse(directCandidate.slice(start, end + 1))
    const record = asRecord(parsed)
    if (!record) throw new Error('JSON root must be an object.')
    return record
  } catch (err) {
    throw new Error(err instanceof Error ? `AI SEO JSON parse failed: ${err.message}` : 'AI SEO JSON parse failed.')
  }
}

function normalizeStructuredData(value: unknown): string | undefined {
  if (asRecord(value)) {
    return JSON.stringify(value, null, 2)
  }

  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  try {
    const parsed = JSON.parse(trimmed)
    const record = asRecord(parsed)
    if (!record) return undefined
    return JSON.stringify(record, null, 2)
  } catch {
    return undefined
  }
}

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

export function getSeoAiTargetLabel(target: SeoAiTarget): string {
  return TARGET_LABELS[target]
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
    lines.push(
      'Do not change list length unless source context requires it.',
    )
  }

  lines.push(
    '',
    'Return this exact shape:',
    buildTargetShape(target),
  )

  return lines.join('\n')
}

export function buildSeoAiSeed(current: SeoSection): string {
  const structuredData = current.structuredData.trim()
  const parsedStructuredData = (() => {
    if (!structuredData) return {}
    try {
      const parsed = JSON.parse(structuredData)
      return asRecord(parsed) || {}
    } catch {
      return {}
    }
  })()

  return JSON.stringify({
    seoTitle: current.seoTitle,
    metaDescription: current.metaDescription,
    openGraph: {
      title: current.openGraph.title,
      description: current.openGraph.description,
      url: current.openGraph.url,
    },
    twitterCard: {
      card: current.twitterCard.card,
      title: current.twitterCard.title,
      description: current.twitterCard.description,
    },
    structuredData: parsedStructuredData,
    robots: current.robots,
  }, null, 2)
}

export function parseSeoAiPatch(response: string): SeoAiPatch {
  const parsed = extractJsonPayload(response)
  const openGraph = asRecord(parsed.openGraph) || {}
  const twitterCard = asRecord(parsed.twitterCard) || {}
  const robots = asRecord(parsed.robots) || {}

  const openGraphUrl = normalizeText(openGraph.url)
  const normalizedOpenGraphUrl = openGraphUrl && isValidAbsoluteUrl(openGraphUrl) ? openGraphUrl : undefined

  return {
    seoTitle: withMaxLength(normalizeText(parsed.seoTitle), 60),
    metaDescription: withReadableMaxLength(normalizeText(parsed.metaDescription), 160),
    openGraph: {
      title: normalizeText(openGraph.title),
      description: normalizeText(openGraph.description),
      url: normalizedOpenGraphUrl,
    },
    twitterCard: {
      card: normalizeTwitterCard(twitterCard.card),
      title: normalizeText(twitterCard.title),
      description: normalizeText(twitterCard.description),
    },
    structuredData: normalizeStructuredData(parsed.structuredData),
    robots: {
      index: normalizeRobotIndex(robots.index),
      follow: normalizeRobotFollow(robots.follow),
    },
  }
}

export function applySeoAiPatch(
  current: SeoSection,
  patch: SeoAiPatch,
  target: SeoAiTarget = 'all',
): SeoSection {
  const targetFields = new Set(TARGET_FIELDS[target])
  const include = (field: SeoFieldKey): boolean => targetFields.has(field)

  return {
    ...current,
    seoTitle: include('seoTitle') ? patch.seoTitle ?? current.seoTitle : current.seoTitle,
    metaDescription: include('metaDescription') ? patch.metaDescription ?? current.metaDescription : current.metaDescription,
    openGraph: {
      ...current.openGraph,
      title: include('openGraphTitle') ? patch.openGraph?.title ?? current.openGraph.title : current.openGraph.title,
      description: include('openGraphDescription') ? patch.openGraph?.description ?? current.openGraph.description : current.openGraph.description,
      url: include('openGraphUrl') ? patch.openGraph?.url ?? current.openGraph.url : current.openGraph.url,
      imageUrl: current.openGraph.imageUrl,
    },
    twitterCard: {
      ...current.twitterCard,
      card: include('twitterCardCard') ? patch.twitterCard?.card ?? current.twitterCard.card : current.twitterCard.card,
      title: include('twitterCardTitle') ? patch.twitterCard?.title ?? current.twitterCard.title : current.twitterCard.title,
      description: include('twitterCardDescription') ? patch.twitterCard?.description ?? current.twitterCard.description : current.twitterCard.description,
      imageUrl: current.twitterCard.imageUrl,
    },
    structuredData: include('structuredData') ? patch.structuredData ?? current.structuredData : current.structuredData,
    robots: {
      index: include('robotsIndex') ? patch.robots?.index ?? current.robots.index : current.robots.index,
      follow: include('robotsFollow') ? patch.robots?.follow ?? current.robots.follow : current.robots.follow,
    },
  }
}
