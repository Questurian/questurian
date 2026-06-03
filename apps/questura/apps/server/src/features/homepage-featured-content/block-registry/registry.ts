import type { Block } from 'payload'

import { CURATED_BLOCK_BEHAVIORS, type CuratedBlockBehavior } from './behaviors'
import { ArticleGridBlock } from '../article-grid/block'
import { ArticleListBlock } from '../article-list/block'
import { FeaturedArticleBlock } from '../featured-article/block'
import { FeaturedArticleCarouselBlock } from '../featured-article-carousel/block'
import { FeaturedArticlesBlock } from '../featured-articles/block'
import { HotelGridBlock } from '../hotel-grid/block'
import { LocationGridBlock } from '../location-grid/block'
import { NewsletterSignupBlock } from '../newsletter-signup/block'
import { QuesturianMapsBlock } from '../questurian-maps/block'
import { ThingsToDoAttractionsBlock } from '../things-to-do-attractions/block'
import { ThingsToDoListiclesBlock } from '../things-to-do-listicles/block'
import { TourGridBlock } from '../tour-grid/block'
import { WhereToEatDrinkBlock } from '../where-to-eat-drink/block'

/**
 * One curated homepage block type. A definition pairs its identity (`blockType`)
 * and Payload `Block` definition (the seam ADR 0005 names) with the per-type
 * `behavior` — normalize / validate / build / selection / publish rules — that the
 * write-path normalizer, read-path resolver, and publish-status rules fold in so
 * they iterate the registry instead of restating a parallel `blockType` switch.
 */
export type CuratedBlockDefinition = {
  /** The `blockType` discriminant string. Equals the Payload Block slug. */
  blockType: string
  /** The Payload Block definition (slug, fields, slot limits). */
  block: Block
  /** Per-type write / read / publish behavior, keyed off the block slug. */
  behavior: CuratedBlockBehavior
}

/**
 * Every curated homepage block type, in editor order. This array is the single
 * source of truth for *which* block types exist; the collection blocks list and
 * the write-path guard are both derived from it rather than restating the set.
 *
 * Order matches the historical `HOMEPAGE_BLOCK_TYPES` array in `collection.ts`
 * and is the order blocks appear in the studio editor — keep it stable.
 */
const CURATED_BLOCK_DEFINITIONS: readonly CuratedBlockDefinition[] = [
  FeaturedArticleBlock,
  FeaturedArticleCarouselBlock,
  FeaturedArticlesBlock,
  ArticleGridBlock,
  LocationGridBlock,
  QuesturianMapsBlock,
  HotelGridBlock,
  TourGridBlock,
  WhereToEatDrinkBlock,
  ThingsToDoListiclesBlock,
  ThingsToDoAttractionsBlock,
  NewsletterSignupBlock,
  ArticleListBlock,
].map((block) => {
  const behavior = CURATED_BLOCK_BEHAVIORS[block.slug]
  if (!behavior) {
    throw new Error(`Curated block "${block.slug}" is registered without a behavior.`)
  }
  return { blockType: block.slug, block, behavior }
})

const DEFINITION_BY_TYPE = new Map(
  CURATED_BLOCK_DEFINITIONS.map((definition) => [definition.blockType, definition]),
)

const BLOCK_TYPE_KEYS: readonly string[] = CURATED_BLOCK_DEFINITIONS.map(
  (definition) => definition.blockType,
)

/**
 * Registry of curated homepage block types. The one place that answers "which
 * block types exist" — `has` replaces the hand-maintained `isCuratedHomepageBlockType`
 * guard, `blocks` feeds the collection's block arrays, and `keys` exposes the set.
 */
export const curatedBlockRegistry = {
  /** Block-type discriminant strings, in editor order. */
  get keys(): readonly string[] {
    return BLOCK_TYPE_KEYS
  },

  /** Fresh array of the Payload Block definitions, in editor order. */
  get blocks(): Block[] {
    return CURATED_BLOCK_DEFINITIONS.map((definition) => definition.block)
  },

  /** Whether `value` is a registered curated block type. */
  has(value: unknown): boolean {
    return typeof value === 'string' && DEFINITION_BY_TYPE.has(value)
  },

  /** The definition for `blockType`, or `undefined` if not registered. */
  get(blockType: string): CuratedBlockDefinition | undefined {
    return DEFINITION_BY_TYPE.get(blockType)
  },
} as const
