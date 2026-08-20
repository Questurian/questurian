import { logger } from '@/shared/utils/logger'
import type { ArticleCollectionSlug } from './serializeArticleBlocks'

/**
 * Sample rule: derives a Free sample from a Gated item's body (ADR-0009).
 *
 * Structural per collection rather than an editor-placed marker. A marker has
 * an unset state, and a paywall with an unset state fails silently in both
 * directions -- a forgotten marker ships the item either entirely free or
 * entirely locked, and nobody finds out from the code. These rules have no
 * unset state.
 *
 * The rules are editorial policy, set 2026-08-15:
 *
 * - A standard article shows its opening prose and nothing else. Images and
 *   the editorial blocks -- key takeaways, pull quotes, in-the-know, highlight
 *   callouts, FAQ -- are held back even when they appear early, because each
 *   carries standalone value and is a reason to subscribe on its own.
 * - An itinerary never shows a day. Only its top-level lodging section
 *   survives; the day-by-day plan is the product.
 * - A single-type listicle is never gated at all. Those earn from ads, and ad
 *   revenue needs the whole page reachable.
 *
 * This module only derives; it does not decide who gets the sample. Callers
 * pair it with the Access tier and the reader's Membership entitlement.
 */

export type SampleUnit = 'blocks' | 'items' | 'days'

export type SampleLimits = {
  /** Leading `text` blocks kept on a standard article. */
  articleTextBlocks: number
}

/**
 * Centralised so the number can move on conversion evidence rather than being
 * scattered across call sites.
 */
export const DEFAULT_SAMPLE_LIMITS: SampleLimits = {
  articleTextBlocks: 2,
}

/**
 * Block types that may appear in a standard article's Free sample.
 *
 * An allowlist, not a blocklist. A new editorial block type added later is
 * withheld by default, which is the safe direction: the alternative leaks paid
 * content the moment someone adds a block and forgets this file.
 */
const SAMPLEABLE_ARTICLE_BLOCKS = new Set(['text'])

export type SampleOutcome = {
  /** Whether anything was actually removed. */
  applied: boolean
  /** What `shown` and `total` are counted in, so the client can phrase the lock. */
  unit: SampleUnit
  shown: number
  total: number
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

function blockTypeOf(block: unknown): string {
  if (!block || typeof block !== 'object') return ''
  const type = (block as { blockType?: unknown }).blockType
  return typeof type === 'string' ? type : ''
}

/**
 * Applies the Sample rule for `collection` to `doc`, mutating it.
 *
 * In-place because `serializeArticleByCollection` already mutates the document
 * the routes serialize; returning a copy would leave two divergent notions of
 * the response body.
 *
 * Callers must have already decided that this reader gets a sample. Calling it
 * for an entitled member would truncate content they are allowed to read.
 */
/**
 * The longest string a Gated item's JSON-LD may carry.
 *
 * Legitimate structured data on these items is metadata: a headline, a
 * description, URLs, names, a `cssSelector`. None of that runs long. Locked
 * prose does, and the only way it reaches JSON-LD is a pipeline or an editor
 * putting it there. 1000 characters is several times the longest honest field
 * and a small fraction of any real body.
 */
const MAX_STRUCTURED_DATA_STRING = 1000

/**
 * Keys that are body text by definition, dropped at any length.
 *
 * `articleBody` is schema.org's own name for the whole article; `text` is the
 * generic equivalent. A short one is a truncated body, not a safe one.
 */
const STRUCTURED_DATA_BODY_KEYS = new Set(['articleBody', 'text'])

/**
 * Remove locked prose from a Gated item's JSON-LD, in place.
 *
 * `seoSection.structuredData` is a free-form `json` field emitted whole by
 * `by-id` and `by-canonical-path`, and the Sample rule did not touch it. It is
 * the one part of a Gated response carrying arbitrary editor-supplied text past
 * the enforcement point — so the day a pipeline or an editor writes
 * `articleBody` into JSON-LD, the paywall is bypassed with no code change and
 * nothing to notice.
 *
 * It lives inside `applySampleRule` rather than in `gatePublicArticle` because
 * there are two enforcement surfaces, not one: the public reader routes and
 * Payload's own REST/GraphQL mounts via `gateExternalApiRead`. Anonymous
 * `GET /api/articles` handing over complete paid bodies (fixed 2026-08-16) is
 * what that second surface costs when a rule lands on only one caller. Both go
 * through here, and so does anything added later.
 *
 * Stripping the field wholesale would be wrong: ADR-0009 requires the
 * paywalled-content markup (`isAccessibleForFree: false` plus `hasPart` with a
 * `cssSelector`) to survive, and it is what keeps a short sample from reading
 * as thin content to Search. The shape is kept; only the long strings go.
 */
function stripLockedProseFromStructuredData(doc: Record<string, unknown>): string[] {
  const seo = doc.seoSection
  if (!seo || typeof seo !== 'object') return []

  const structuredData = (seo as Record<string, unknown>).structuredData
  if (!structuredData || typeof structuredData !== 'object') return []

  const removed: string[] = []

  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`))
      return
    }

    if (!node || typeof node !== 'object') return

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const here = path ? `${path}.${key}` : key

      if (typeof value === 'string') {
        if (STRUCTURED_DATA_BODY_KEYS.has(key) || value.length > MAX_STRUCTURED_DATA_STRING) {
          delete (node as Record<string, unknown>)[key]
          removed.push(here)
        }
        continue
      }

      walk(value, here)
    }
  }

  walk(structuredData, '')

  return removed
}

export function applySampleRule(
  collection: ArticleCollectionSlug,
  doc: Record<string, unknown>,
  limits: SampleLimits = DEFAULT_SAMPLE_LIMITS,
): SampleOutcome {
  if (collection === 'articles' || collection === 'listicle-itineraries') {
    const removed = stripLockedProseFromStructuredData(doc)
    if (removed.length > 0) {
      logger.warn("Removed body-length text from a gated item's structured data", {
        collection,
        id: doc.id,
        keys: removed,
      })
    }

    return collection === 'articles' ? sampleArticle(doc, limits) : sampleItinerary(doc)
  }

  // Single-type listicles are never gated. Reached only if a caller ignores
  // that, so it removes nothing rather than inventing a rule for a collection
  // that has no paid tier.
  return { applied: false, unit: 'items', shown: 0, total: 0 }
}

function sampleArticle(doc: Record<string, unknown>, limits: SampleLimits): SampleOutcome {
  const blocks = asArray(doc.contentBlocks)
  if (!blocks) return { applied: false, unit: 'blocks', shown: 0, total: 0 }

  const total = blocks.length
  const kept: unknown[] = []

  for (const block of blocks) {
    if (kept.length >= limits.articleTextBlocks) break
    if (SAMPLEABLE_ARTICLE_BLOCKS.has(blockTypeOf(block))) kept.push(block)
  }

  doc.contentBlocks = kept

  return {
    applied: kept.length < total,
    unit: 'blocks',
    shown: kept.length,
    total,
  }
}

function sampleItinerary(doc: Record<string, unknown>): SampleOutcome {
  const days = asArray(doc.itineraryDays) ?? []
  const legacyItems = asArray(doc.items) ?? []

  // Every day goes, including each day's own lodging -- per-day lodging lives
  // inside the day rows, and the policy is that no day survives. Only the
  // itinerary's top-level `whereStaying` is left untouched.
  const applied = days.length > 0 || legacyItems.length > 0
  doc.itineraryDays = []
  doc.items = []

  return {
    applied,
    unit: 'days',
    shown: 0,
    total: days.length,
  }
}
