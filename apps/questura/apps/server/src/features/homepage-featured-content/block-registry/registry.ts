import type { Block } from 'payload'

import { CURATED_BLOCK_BEHAVIORS, type CuratedBlockBehavior } from './behaviors'
import { ArticleGridBlock } from '../article-grid/block'
import { ArticleListBlock } from '../article-list/block'
import {
  HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
  HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
  HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
  HOMEPAGE_TOUR_GRID_MAX_SLOTS,
  HOMEPAGE_TOUR_GRID_MIN_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
} from '../constants'
import { FeaturedArticleBlock } from '../featured-article/block'
import { FeaturedArticleCarouselBlock } from '../featured-article-carousel/block'
import { FeaturedArticlesBlock } from '../featured-articles/block'
import { FeaturedCreatorArticleBlock } from '../featured-creator-article/block'
import { EditorialFeatureBlock } from '../editorial-feature/block'
import { HotelGridBlock } from '../hotel-grid/block'
import { LOCATION_GRID_MAX_SLOTS, LOCATION_GRID_MIN_SLOTS } from '../location-grid/constants'
import { LocationGridBlock } from '../location-grid/block'
import { NewsletterSignupBlock } from '../newsletter-signup/block'
import { QuesturianMapsBlock } from '../questurian-maps/block'
import { ThingsToDoAttractionsBlock } from '../things-to-do-attractions/block'
import { ThingsToDoListiclesBlock } from '../things-to-do-listicles/block'
import { TourGridBlock } from '../tour-grid/block'
import { WhereToEatDrinkBlock } from '../where-to-eat-drink/block'

export type CuratedBlockPublicPayloadKind = 'article' | 'reference'

export type CuratedBlockSlotCounts = {
  min: number
  max: number
  default: number
  validCounts?: readonly number[]
  invalidFallback?: 'default' | 'previous-valid'
}

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
  /** Canonical slot-count bounds/defaults and any sparse valid-count set. */
  slotCounts: CuratedBlockSlotCounts
  /** Whether POST .../blocks/convert may use this block as an empty source. */
  convertibleWhenEmpty: boolean
  /** Public API formatter family. Article blocks reduce selection to public article cards. */
  publicPayloadKind: CuratedBlockPublicPayloadKind
}

type CuratedBlockDefinitionInput = Omit<CuratedBlockDefinition, 'blockType' | 'behavior'>

function defineCuratedBlock(input: CuratedBlockDefinitionInput): CuratedBlockDefinition {
  const behavior = CURATED_BLOCK_BEHAVIORS[input.block.slug]
  if (!behavior) {
    throw new Error(`Curated block "${input.block.slug}" is registered without a behavior.`)
  }
  return { blockType: input.block.slug, behavior, ...input }
}

const ARTICLE_PUBLIC_PAYLOAD = 'article' satisfies CuratedBlockPublicPayloadKind
const REFERENCE_PUBLIC_PAYLOAD = 'reference' satisfies CuratedBlockPublicPayloadKind

/**
 * Every curated homepage block type, in editor order. This array is the single
 * source of truth for *which* block types exist; the collection blocks list and
 * the write-path guard are both derived from it rather than restating the set.
 *
 * Order matches the historical `HOMEPAGE_BLOCK_TYPES` array in `collection.ts`
 * and is the order blocks appear in the studio editor — keep it stable.
 */
const CURATED_BLOCK_DEFINITIONS: readonly CuratedBlockDefinition[] = [
  defineCuratedBlock({
    block: FeaturedArticleBlock,
    slotCounts: { min: 1, max: 1, default: 1 },
    convertibleWhenEmpty: true,
    publicPayloadKind: ARTICLE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: FeaturedCreatorArticleBlock,
    slotCounts: { min: 1, max: 1, default: 1 },
    convertibleWhenEmpty: true,
    publicPayloadKind: ARTICLE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: FeaturedArticleCarouselBlock,
    slotCounts: { min: 2, max: 10, default: 3 },
    convertibleWhenEmpty: true,
    publicPayloadKind: ARTICLE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: FeaturedArticlesBlock,
    slotCounts: {
      min: 3,
      max: 9,
      default: 4,
      validCounts: [3, 4, 5, 7, 8, 9],
      invalidFallback: 'previous-valid',
    },
    convertibleWhenEmpty: true,
    publicPayloadKind: ARTICLE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: EditorialFeatureBlock,
    slotCounts: {
      min: 2,
      max: 6,
      default: 3,
      validCounts: [2, 3, 4, 6],
      invalidFallback: 'previous-valid',
    },
    convertibleWhenEmpty: true,
    publicPayloadKind: ARTICLE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: ArticleGridBlock,
    slotCounts: {
      min: 4,
      max: 8,
      default: 4,
      validCounts: [4, 8],
      invalidFallback: 'default',
    },
    convertibleWhenEmpty: true,
    publicPayloadKind: ARTICLE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: LocationGridBlock,
    slotCounts: { min: LOCATION_GRID_MIN_SLOTS, max: LOCATION_GRID_MAX_SLOTS, default: 4 },
    convertibleWhenEmpty: true,
    publicPayloadKind: REFERENCE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: QuesturianMapsBlock,
    slotCounts: {
      min: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
      max: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
      default: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
    },
    convertibleWhenEmpty: true,
    publicPayloadKind: ARTICLE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: HotelGridBlock,
    slotCounts: {
      min: HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
      max: HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
      default: 4,
    },
    convertibleWhenEmpty: true,
    publicPayloadKind: REFERENCE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: TourGridBlock,
    slotCounts: {
      min: HOMEPAGE_TOUR_GRID_MIN_SLOTS,
      max: HOMEPAGE_TOUR_GRID_MAX_SLOTS,
      default: 4,
    },
    convertibleWhenEmpty: true,
    publicPayloadKind: REFERENCE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: WhereToEatDrinkBlock,
    slotCounts: {
      min: HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
      max: HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
      default: 4,
    },
    convertibleWhenEmpty: true,
    publicPayloadKind: ARTICLE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: ThingsToDoListiclesBlock,
    slotCounts: {
      min: HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
      max: HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
      default: 4,
    },
    convertibleWhenEmpty: true,
    publicPayloadKind: ARTICLE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: ThingsToDoAttractionsBlock,
    slotCounts: {
      min: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
      max: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
      default: 4,
    },
    convertibleWhenEmpty: true,
    publicPayloadKind: REFERENCE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: NewsletterSignupBlock,
    slotCounts: { min: 0, max: 0, default: 0 },
    convertibleWhenEmpty: false,
    publicPayloadKind: REFERENCE_PUBLIC_PAYLOAD,
  }),
  defineCuratedBlock({
    block: ArticleListBlock,
    slotCounts: { min: 5, max: 25, default: 5 },
    convertibleWhenEmpty: false,
    publicPayloadKind: ARTICLE_PUBLIC_PAYLOAD,
  }),
]

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

  /** Full block definitions, in editor order. */
  get definitions(): readonly CuratedBlockDefinition[] {
    return CURATED_BLOCK_DEFINITIONS
  },

  /** Fresh array of the Payload Block definitions, in editor order. */
  get blocks(): Block[] {
    return CURATED_BLOCK_DEFINITIONS.map((definition) => definition.block)
  },

  /** Block types whose public payload reduces to public article card data. */
  get publicArticleBlockTypes(): ReadonlySet<string> {
    return new Set(
      CURATED_BLOCK_DEFINITIONS.filter(
        (definition) => definition.publicPayloadKind === 'article',
      ).map((definition) => definition.blockType),
    )
  },

  /** Block types that may be converted when their stored items are empty. */
  get emptyConvertSourceBlockTypes(): readonly string[] {
    return CURATED_BLOCK_DEFINITIONS.filter((definition) => definition.convertibleWhenEmpty).map(
      (definition) => definition.blockType,
    )
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
