import { PAYWALL_SELECTOR } from './gate'

const ARTICLE_TYPES = new Set([
  'Article',
  'NewsArticle',
  'BlogPosting',
  'Report',
  'ScholarlyArticle',
  'TechArticle',
])

function isArticleNode(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const type = (value as { '@type'?: unknown })['@type']
  return typeof type === 'string' && ARTICLE_TYPES.has(type)
}

/**
 * The paywall properties Google reads to tell a lead-in sample apart from
 * cloaking or thin content.
 *
 * `hasPart` names the element that stands in for the withheld body. Under
 * ADR-0009 the locked content is absent from the response entirely, so the
 * marked element is the notice that replaces it -- which is genuinely the
 * paywalled part of this page, and is the only honest thing to point at.
 */
function paywallProperties(): Record<string, unknown> {
  return {
    isAccessibleForFree: false,
    hasPart: {
      '@type': 'WebPageElement',
      isAccessibleForFree: false,
      cssSelector: PAYWALL_SELECTOR,
    },
  }
}

type BuildPaywallJsonLdParams = {
  headline: string
  /** Editor-supplied structured data from the SEO tab, if any. */
  existing?: unknown
}

/**
 * Returns the JSON-LD to emit for a Gated item, or `null` when there is
 * nothing to say.
 *
 * Merges into the editor's own structured data when that is already an Article
 * node, rather than emitting a second one. Two Article nodes describing one
 * page, one of them silent about the paywall, is exactly the ambiguity this
 * markup exists to remove.
 */
export function buildPaywallJsonLd({
  headline,
  existing,
}: BuildPaywallJsonLdParams): Record<string, unknown> | null {
  if (isArticleNode(existing)) {
    return { ...existing, ...paywallProperties() }
  }

  if (!headline) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    ...paywallProperties(),
  }
}

/**
 * Every JSON-LD node a public article page should emit, in render order.
 *
 * One helper rather than the same three-way condition copied into each route
 * renderer: the wrong branch either drops the editor's structured data or emits
 * two Article nodes disagreeing about whether the page is paywalled, and both
 * failures are invisible without viewing source.
 */
export function articleJsonLdNodes({
  locked,
  headline,
  existing,
}: {
  locked: boolean
  headline: string
  existing?: unknown
}): unknown[] {
  if (!locked) return [existing]

  const paywall = buildPaywallJsonLd({ headline, existing })
  if (!paywall) return [existing]

  // Merged into the editor's own node, so rendering that separately as well
  // would put two conflicting descriptions of one page on it.
  if (isArticleNode(existing)) return [paywall]

  return [existing, paywall]
}
