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
 * The cut also lands on each shape's natural seam. An itinerary keeps Day 1
 * whole, which is both a clean boundary and the best pitch available: "see
 * Day 1 free, unlock all five days". A block count would have cut mid-day.
 *
 * This module only derives; it does not decide who gets the sample. Callers
 * pair it with the Access tier and the reader's Membership entitlement.
 */

export type SampleUnit = 'blocks' | 'items' | 'days'

export type SampleLimits = {
  /** Leading `contentBlocks` kept on a standard article. */
  articleBlocks: number
  /** Leading `items` kept on a single-type listicle. */
  listicleItems: number
  /** Leading `itineraryDays` kept whole on a listicle itinerary. */
  itineraryDays: number
}

/**
 * Guesses, deliberately centralised so they can move on conversion evidence
 * rather than being scattered across call sites.
 */
export const DEFAULT_SAMPLE_LIMITS: SampleLimits = {
  articleBlocks: 3,
  listicleItems: 3,
  itineraryDays: 1,
}

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

/**
 * Truncates `doc[key]` to `limit` entries in place.
 *
 * In-place because `serializeArticleByCollection` already mutates the document
 * it is handed and the routes serialize that same object; returning a copy here
 * would leave two divergent notions of the response body.
 */
function truncate(
  doc: Record<string, unknown>,
  key: string,
  limit: number,
): { shown: number; total: number; applied: boolean } {
  const list = asArray(doc[key])
  if (!list) return { shown: 0, total: 0, applied: false }

  const total = list.length
  const shown = Math.max(0, Math.min(limit, total))
  if (shown >= total) return { shown: total, total, applied: false }

  doc[key] = list.slice(0, shown)
  return { shown, total, applied: true }
}

/**
 * Applies the Sample rule for `collection` to `doc`, mutating it.
 *
 * Callers must have already decided that this reader gets a sample. Calling it
 * on a free item or for an entitled member would silently truncate content
 * they are allowed to read.
 */
export function applySampleRule(
  collection: ArticleCollectionSlug,
  doc: Record<string, unknown>,
  limits: SampleLimits = DEFAULT_SAMPLE_LIMITS,
): SampleOutcome {
  if (collection === 'articles') {
    const r = truncate(doc, 'contentBlocks', limits.articleBlocks)
    return { applied: r.applied, unit: 'blocks', shown: r.shown, total: r.total }
  }

  if (collection === 'single-type-listicles') {
    const r = truncate(doc, 'items', limits.listicleItems)
    return { applied: r.applied, unit: 'items', shown: r.shown, total: r.total }
  }

  // Listicle itineraries carry two body shapes. `itineraryDays` is current;
  // top-level `items`/`whereStaying` are the legacy pre-days layout that
  // beforeValidate still normalises. Cut whichever one this document uses.
  const days = asArray(doc.itineraryDays)
  if (days && days.length > 0) {
    const r = truncate(doc, 'itineraryDays', limits.itineraryDays)
    // Legacy top-level body is not part of a day-shaped itinerary's sample.
    // Leaving it would hand back the very stops the day cut removed.
    const hadLegacy = stripLegacyItineraryBody(doc)
    return {
      applied: r.applied || hadLegacy,
      unit: 'days',
      shown: r.shown,
      total: r.total,
    }
  }

  // Legacy itinerary: no days to cut on, so fall back to the listicle rule and
  // drop lodging, which is the part worth paying for.
  const r = truncate(doc, 'items', limits.listicleItems)
  const hadLodging = stripWhereStaying(doc)
  return { applied: r.applied || hadLodging, unit: 'items', shown: r.shown, total: r.total }
}

function stripWhereStaying(doc: Record<string, unknown>): boolean {
  const lodging = asArray(doc.whereStaying)
  if (!lodging || lodging.length === 0) return false
  doc.whereStaying = []
  return true
}

function stripLegacyItineraryBody(doc: Record<string, unknown>): boolean {
  let stripped = false

  const legacyItems = asArray(doc.items)
  if (legacyItems && legacyItems.length > 0) {
    doc.items = []
    stripped = true
  }

  if (stripWhereStaying(doc)) stripped = true

  return stripped
}
