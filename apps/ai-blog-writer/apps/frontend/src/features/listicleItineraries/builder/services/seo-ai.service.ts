import type { SeoSection } from '../../types'

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

export function buildSeoAiPrompt(input: {
  articleType: string
  location?: string
  dayAudience?: string
  itineraryWindow?: string
}): string {
  const locationText = input.location?.trim() ? input.location.trim() : 'Unknown location'
  const dayAudience = input.dayAudience?.trim() ? input.dayAudience : 'any audience'
  const itineraryWindow = input.itineraryWindow?.trim() ? input.itineraryWindow : 'unknown timeframe'

  return [
    'Generate SEO metadata for the provided itinerary article context.',
    '',
    'Rules:',
    '- Use the article context as the source of truth.',
    '- Return ONLY valid JSON (no markdown, no commentary).',
    '- Do NOT include image fields.',
    '- seoTitle must be <= 60 characters and keyword-rich.',
    '- metaDescription should be compelling and around 150-160 characters.',
    '- openGraph and twitter should align with the article and be share-ready.',
    '- structuredData must be a JSON object (JSON-LD style).',
    '- robots should usually be index/follow unless context suggests otherwise.',
    '',
    `Article type: ${input.articleType}`,
    `Location: ${locationText}`,
    `Audience: ${dayAudience}`,
    `Time window: ${itineraryWindow}`,
    '',
    'Return this exact shape:',
    '{',
    '  "seoTitle": "string",',
    '  "metaDescription": "string",',
    '  "openGraph": {',
    '    "title": "string",',
    '    "description": "string",',
    '    "url": "string"',
    '  },',
    '  "twitterCard": {',
    '    "card": "summary or summary_large_image",',
    '    "title": "string",',
    '    "description": "string"',
    '  },',
    '  "structuredData": {',
    '    "@context": "https://schema.org",',
    '    "@type": "Article"',
    '  },',
    '  "robots": {',
    '    "index": "index or noindex",',
    '    "follow": "follow or nofollow"',
    '  }',
    '}',
  ].join('\n')
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
  const structuredData = normalizeStructuredData(parsed.structuredData)

  return {
    seoTitle: withMaxLength(normalizeText(parsed.seoTitle), 60),
    metaDescription: withMaxLength(normalizeText(parsed.metaDescription), 160),
    openGraph: {
      title: normalizeText(openGraph.title),
      description: normalizeText(openGraph.description),
      url: openGraphUrl && isValidAbsoluteUrl(openGraphUrl) ? openGraphUrl : undefined,
    },
    twitterCard: {
      card: twitterCard.card === 'summary_large_image' ? 'summary_large_image' : 'summary',
      title: normalizeText(twitterCard.title),
      description: normalizeText(twitterCard.description),
    },
    structuredData,
    robots: {
      index: robots.index === 'noindex' ? 'noindex' : 'index',
      follow: robots.follow === 'nofollow' ? 'nofollow' : 'follow',
    },
  }
}

export function applySeoAiPatch(current: SeoSection, patch: SeoAiPatch): SeoSection {
  return {
    ...current,
    seoTitle: patch.seoTitle ?? current.seoTitle,
    metaDescription: patch.metaDescription ?? current.metaDescription,
    openGraph: {
      ...current.openGraph,
      title: patch.openGraph?.title ?? current.openGraph.title,
      description: patch.openGraph?.description ?? current.openGraph.description,
      url: patch.openGraph?.url ?? current.openGraph.url,
      imageUrl: current.openGraph.imageUrl,
    },
    twitterCard: {
      ...current.twitterCard,
      card: patch.twitterCard?.card ?? current.twitterCard.card,
      title: patch.twitterCard?.title ?? current.twitterCard.title,
      description: patch.twitterCard?.description ?? current.twitterCard.description,
      imageUrl: current.twitterCard.imageUrl,
    },
    structuredData: patch.structuredData ?? current.structuredData,
    robots: {
      index: patch.robots?.index ?? current.robots.index,
      follow: patch.robots?.follow ?? current.robots.follow,
    },
  }
}
