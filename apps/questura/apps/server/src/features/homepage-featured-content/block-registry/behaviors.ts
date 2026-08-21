import type { Payload } from 'payload'

import type { PayloadInstance } from '@/types'

import { normalizeArticleGridFourLayout } from '../article-grid/service'
import {
  buildHomepageFeaturedGlobalData,
  getHomepageFeaturedSelectionFromItems,
  getNewsletterSignupPlaceholderSelection,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from '../featured-articles/service'
import {
  buildHotelGridGlobalData,
  getHotelGridSelectionFromItems,
  normalizeHotelGridInput,
  validateHotelGridItems,
} from '../hotel-grid/service'
import { normalizeLocationGridMediaAspect } from '../location-grid/lib/media-aspect'
import {
  buildLocationGridGlobalData,
  getLocationGridSelectionFromItems,
  normalizeLocationGridInput,
  validateLocationGridItems,
} from '../location-grid/service'
import type { LocationGridScope } from '../location-grid/types'
import {
  buildQuesturianMapsGlobalData,
  getQuesturianMapsSelectionFromItems,
  normalizeQuesturianMapsInput,
  validateQuesturianMapsItems,
} from '../questurian-maps/service'
import {
  buildThingsToDoAttractionsGlobalData,
  getThingsToDoAttractionsSelectionFromItems,
  normalizeThingsToDoAttractionsInput,
  validateThingsToDoAttractionsItems,
} from '../things-to-do-attractions/service'
import {
  buildThingsToDoListiclesGlobalData,
  getThingsToDoListiclesSelectionFromItems,
  normalizeThingsToDoListiclesInput,
  validateThingsToDoListiclesItems,
} from '../things-to-do-listicles/service'
import {
  buildTourGridGlobalData,
  getTourGridSelectionFromItems,
  normalizeTourGridInput,
  validateTourGridItems,
} from '../tour-grid/service'
import {
  buildWhereToEatDrinkGlobalData,
  getWhereToEatDrinkSelectionFromItems,
  normalizeWhereToEatDrinkInput,
  validateWhereToEatDrinkItems,
} from '../where-to-eat-drink/service'

/**
 * Context handed to a block's write-path hooks (`assertAllowed`, `buildStoredItems`)
 * during `normalizePageBlocksArrayInPlace`. Mirrors what the former per-type `if/else`
 * branches closed over: the resolved slot count, the drafts flag, and the location scope.
 */
export type BlockWritePathContext = {
  payload: Payload
  slotCount: number
  allowDrafts: boolean
  locationGridScope: LocationGridScope | null
}

/** Context handed to a block's read-path hook (`resolveSelection`) during `resolvePageBlocks`. */
export type BlockReadPathContext = {
  payload: PayloadInstance
  slotCount: number
  locationGridScope: LocationGridScope | null
}

/**
 * Per-type behavior for one curated homepage block. This is the seam the registry folds in
 * so the write-path normalizer, the read-path resolver, and the publish-status rules each
 * iterate the registry instead of restating a parallel `blockType` switch.
 */
export type CuratedBlockBehavior = {
  /**
   * Normalize the block record in place before validation — layout defaults, media-aspect.
   * Runs on every curated block (changed or not), matching the legacy pre-validate mutations.
   */
  prepareRecord?: (block: Record<string, unknown>, slotCount: number) => void
  /** Throw if this block type isn't allowed for the current scope. Runs on changed blocks. */
  assertAllowed?: (ctx: BlockWritePathContext) => void
  /** This block holds no references — its `items` are cleared to `[]`. */
  clearsItems?: boolean
  /** Normalize → validate → build the stored `items`. Returns the new array. */
  buildStoredItems?: (items: unknown, ctx: BlockWritePathContext) => Promise<unknown[]>
  /** Read path: resolve stored items into the editor-facing selection. */
  resolveSelection: (items: unknown, ctx: BlockReadPathContext) => unknown | Promise<unknown>
  /**
   * Article-style block whose items must each be individually published and image-ready
   * to publish (the former `ARTICLE_BLOCK_TYPES` membership in `publish-status.ts`).
   */
  isArticleBlock?: boolean
  /** The image field a slot must have ready, given the block + slot index. Defaults to `image`. */
  requiredImageField?: (block: Record<string, unknown>, slotIndex: number) => string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Behavior for the common "grid of references" block: normalize → validate(`allowDrafts`,
 * `slotCount`) → build, and a selection resolved from `totalSlots`. The featured-article
 * family, the hotel/tour/eat-drink/things-to-do grids, and questurian-maps all share it.
 */
function gridBehavior(slice: {
  normalize: (items: unknown) => unknown[]
  validate: (
    payload: Payload,
    refs: never[],
    options: { allowDrafts?: boolean; slotCount?: number },
  ) => Promise<unknown>
  build: (refs: never[]) => { items: unknown[] }
  resolveSelection: (
    payload: PayloadInstance,
    items: unknown,
    options: { totalSlots?: number },
  ) => unknown | Promise<unknown>
  isArticleBlock?: boolean
  prepareRecord?: CuratedBlockBehavior['prepareRecord']
  requiredImageField?: CuratedBlockBehavior['requiredImageField']
}): CuratedBlockBehavior {
  return {
    isArticleBlock: slice.isArticleBlock,
    prepareRecord: slice.prepareRecord,
    requiredImageField: slice.requiredImageField,
    async buildStoredItems(items, ctx) {
      const refs = slice.normalize(items) as never[]
      await slice.validate(ctx.payload, refs, {
        allowDrafts: ctx.allowDrafts,
        slotCount: ctx.slotCount,
      })
      return slice.build(refs).items
    },
    resolveSelection(items, ctx) {
      return slice.resolveSelection(ctx.payload, items, { totalSlots: ctx.slotCount })
    },
  }
}

const featuredBehavior = gridBehavior({
  normalize: normalizeHomepageFeaturedInput,
  validate: validateHomepageFeaturedItems,
  build: buildHomepageFeaturedGlobalData,
  resolveSelection: getHomepageFeaturedSelectionFromItems,
  isArticleBlock: true,
})

/** Image field for an `article-grid` slot — square card for 8-up or the two-by-two layout. */
function articleGridImageField(block: Record<string, unknown>): string {
  const totalSlots = Number(isRecord(block.selection) ? block.selection.totalSlots : 0)
  const layout = text(block.articleGridFourLayout)
  return totalSlots === 8 || layout === 'two-by-two' ? 'imageSquare' : 'image'
}

const locationGridBehavior: CuratedBlockBehavior = {
  isArticleBlock: false,
  prepareRecord(block) {
    block.mediaAspect = normalizeLocationGridMediaAspect(block.mediaAspect)
  },
  assertAllowed(ctx) {
    if (!ctx.locationGridScope) {
      throw new Error('Location Grid blocks are only available on city homepages.')
    }
  },
  async buildStoredItems(items, ctx) {
    const refs = normalizeLocationGridInput(items)
    await validateLocationGridItems(ctx.payload, refs, {
      scope: ctx.locationGridScope,
      slotCount: ctx.slotCount,
    })
    return buildLocationGridGlobalData(refs).items
  },
  resolveSelection(items, ctx) {
    return getLocationGridSelectionFromItems(ctx.payload, items, {
      totalSlots: ctx.slotCount,
      scope: ctx.locationGridScope,
    })
  },
}

const newsletterSignupBehavior: CuratedBlockBehavior = {
  isArticleBlock: false,
  clearsItems: true,
  resolveSelection() {
    return getNewsletterSignupPlaceholderSelection()
  },
}

/**
 * Per-type behavior keyed by `blockType`. The registry pairs each entry with its Payload
 * `Block` by slug; a block registered without a behavior here fails fast at module load.
 */
export const CURATED_BLOCK_BEHAVIORS: Record<string, CuratedBlockBehavior> = {
  'featured-article': { ...featuredBehavior, requiredImageField: () => 'imageHero' },
  'featured-creator-article': { ...featuredBehavior, requiredImageField: () => 'imageHero' },
  'featured-article-carousel': featuredBehavior,
  'featured-articles': {
    ...featuredBehavior,
    requiredImageField: (_block, slotIndex) => (slotIndex === 0 ? 'imageHero' : 'image'),
  },
  'article-grid': {
    ...featuredBehavior,
    prepareRecord(block, slotCount) {
      if (slotCount === 4) {
        block.articleGridFourLayout = normalizeArticleGridFourLayout(block.articleGridFourLayout)
      }
    },
    requiredImageField: articleGridImageField,
  },
  'location-grid': locationGridBehavior,
  'questurian-maps': gridBehavior({
    normalize: normalizeQuesturianMapsInput,
    validate: validateQuesturianMapsItems,
    build: buildQuesturianMapsGlobalData,
    resolveSelection: getQuesturianMapsSelectionFromItems,
    isArticleBlock: true,
  }),
  'hotel-grid': gridBehavior({
    normalize: normalizeHotelGridInput,
    validate: validateHotelGridItems,
    build: buildHotelGridGlobalData,
    resolveSelection: getHotelGridSelectionFromItems,
  }),
  'tour-grid': gridBehavior({
    normalize: normalizeTourGridInput,
    validate: validateTourGridItems,
    build: buildTourGridGlobalData,
    resolveSelection: getTourGridSelectionFromItems,
  }),
  'where-to-eat-drink': gridBehavior({
    normalize: normalizeWhereToEatDrinkInput,
    validate: validateWhereToEatDrinkItems,
    build: buildWhereToEatDrinkGlobalData,
    resolveSelection: getWhereToEatDrinkSelectionFromItems,
    isArticleBlock: true,
  }),
  'things-to-do-listicles': gridBehavior({
    normalize: normalizeThingsToDoListiclesInput,
    validate: validateThingsToDoListiclesItems,
    build: buildThingsToDoListiclesGlobalData,
    resolveSelection: getThingsToDoListiclesSelectionFromItems,
    isArticleBlock: true,
  }),
  'things-to-do-attractions': gridBehavior({
    normalize: normalizeThingsToDoAttractionsInput,
    validate: validateThingsToDoAttractionsItems,
    build: buildThingsToDoAttractionsGlobalData,
    resolveSelection: getThingsToDoAttractionsSelectionFromItems,
  }),
  'newsletter-signup': newsletterSignupBehavior,
  'article-list': featuredBehavior,
}
