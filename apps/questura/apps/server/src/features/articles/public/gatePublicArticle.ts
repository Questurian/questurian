import { DEFAULT_ACCESS_TIER, isAccessTier, isGatedItem } from '@/shared/content/accessTier'
import type { AccessTier } from '@/shared/content/accessTier'
import { applySampleRule, type SampleUnit } from './freeSample'
import type { ArticleCollectionSlug } from './serializeArticleBlocks'

/**
 * Reader-facing lock state attached to a public article payload.
 *
 * Always present, on free items too. An absent key is indistinguishable from a
 * key the client forgot to read, and "is this locked" is not a question a
 * paywall should answer by omission.
 */
export type GateState = {
  access: AccessTier
  locked: boolean
  /** What `shown`/`total` count, so the client can say "Day 1 of 5". */
  unit: SampleUnit
  shown: number
  total: number
}

/**
 * Reduces a public article document to what an unentitled reader may see, and
 * records why (ADR-0009).
 *
 * This is the enforcement point for the **cached** public routes, and it takes
 * no reader identity on purpose. Those routes are served from a `force-static`
 * shell with hourly ISR, so their response is shared by every caller --
 * anonymous readers, members and search crawlers alike. Varying it by reader
 * is what turns a shared cache into a paywall leak in one direction and a
 * lockout in the other. A member's full body comes from a separate dynamic
 * route instead.
 *
 * Gating happens where the body is serialized rather than where it is queried,
 * because every public read runs `overrideAccess: true` -- Payload collection
 * access control is bypassed on all of them and cannot gate anything here.
 */
export function gatePublicArticle(
  collection: ArticleCollectionSlug,
  doc: Record<string, unknown>,
): GateState {
  const access = isAccessTier(doc.access) ? doc.access : DEFAULT_ACCESS_TIER

  if (!isGatedItem(doc)) {
    const state: GateState = { access, locked: false, unit: 'blocks', shown: 0, total: 0 }
    doc.gate = state
    return state
  }

  const outcome = applySampleRule(collection, doc)

  // `locked` is the tier, not the outcome. A Gated item shorter than its own
  // sample limit loses nothing to the cut, but it is still paid content and
  // still has to render as such -- otherwise a short itinerary would quietly
  // become the free one.
  const state: GateState = {
    access,
    locked: true,
    unit: outcome.unit,
    shown: outcome.shown,
    total: outcome.total,
  }

  doc.gate = state
  return state
}
