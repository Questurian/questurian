import type { LocationGridMediaAspect } from './locationGridTypes'
import {
  ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPE_SET,
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  HOMEPAGE_PAGE_BLOCK_TYPE_SET
} from './pageBlocks.definitions'
import type {
  ArticleCuratedHomepageBlockResponse,
  ArticleGridFourLayout,
  CuratedHomepageBlockResponse,
  EditorialFeatureBlockResponse,
  FeaturedArticlesSlot3Layout,
  FeaturedArticlesSlot4Layout,
  FeaturedArticlesSlot5Layout,
  HotelGridBlockResponse,
  LocationGridBlockResponse,
  NewsletterSignupBlockResponse,
  PageBlockResponse,
  ThingsToDoAttractionsBlockResponse,
  TourGridBlockResponse
} from './pageBlocks.responses'

/** Stable identity for editor instances; layout-only setting changes should not remount a block. */
export function homepageBlockEditorIdentity(block: {
  id: string
  blockType: string
  selection: { totalSlots: number }
}): readonly [string, string, number] {
  return [block.id, block.blockType, block.selection.totalSlots]
}

/** Same Payload `id` can change `blockType` / slot count (convert). Include shape in React key + query key so editors remount and TanStack cache does not reuse old `selection`. */
export function homepageBlockShapeIdentity(block: {
  id: string
  blockType: string
  selection: { totalSlots: number }
  slot3Layout?: FeaturedArticlesSlot3Layout | null
  slot4Layout?: FeaturedArticlesSlot4Layout | null
  slot5Layout?: FeaturedArticlesSlot5Layout | null
  mediaAspect?: LocationGridMediaAspect | null
  articleGridFourLayout?: ArticleGridFourLayout | null
}): readonly [string, string, number, string] {
  let layoutKey = '-'
  if (block.blockType === 'featured-articles') {
    if (block.selection.totalSlots === 3) {
      layoutKey = `3:${block.slot3Layout ?? 'hero-left'}`
    } else if (block.selection.totalSlots === 4) {
      layoutKey = `4:${block.slot4Layout ?? 'sidebar-stack'}`
    } else if (block.selection.totalSlots === 5) {
      layoutKey = `5:${block.slot5Layout ?? 'card-grid'}`
    }
  } else if (block.blockType === 'location-grid') {
    layoutKey = `lg:${block.mediaAspect ?? 'rectangle'}`
  } else if (
    block.blockType === 'article-grid' &&
    block.selection.totalSlots === 4
  ) {
    layoutKey = `ag4:${block.articleGridFourLayout ?? 'four-across'}`
  }
  return [block.id, block.blockType, block.selection.totalSlots, layoutKey]
}

export function isCuratedHomepageBlock(
  block: PageBlockResponse
): block is CuratedHomepageBlockResponse {
  return HOMEPAGE_PAGE_BLOCK_TYPE_SET.has(block.blockType)
}

export function isArticleCuratedHomepageBlock(
  block: PageBlockResponse
): block is ArticleCuratedHomepageBlockResponse {
  return ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPE_SET.has(block.blockType)
}

export function isEditorialFeatureBlock(
  block: PageBlockResponse
): block is EditorialFeatureBlockResponse {
  return block.blockType === 'editorial-feature'
}

export function isLocationGridBlock(
  block: PageBlockResponse
): block is LocationGridBlockResponse {
  return block.blockType === 'location-grid'
}

export function isHotelGridBlock(
  block: PageBlockResponse
): block is HotelGridBlockResponse {
  return block.blockType === 'hotel-grid'
}

export function isTourGridBlock(
  block: PageBlockResponse
): block is TourGridBlockResponse {
  return block.blockType === 'tour-grid'
}

export function isThingsToDoAttractionsBlock(
  block: PageBlockResponse
): block is ThingsToDoAttractionsBlockResponse {
  return block.blockType === 'things-to-do-attractions'
}

export function isNewsletterSignupBlock(
  block: PageBlockResponse
): block is NewsletterSignupBlockResponse {
  return block.blockType === 'newsletter-signup'
}

/** Human-readable block type tag matching block editor headers (e.g. "Featured Articles · 7 slots"). */
export function formatHomepageBlockTypeTagLabel(
  block: PageBlockResponse
): string {
  if (!isCuratedHomepageBlock(block)) {
    return block.blockType
  }
  const config = HOMEPAGE_PAGE_BLOCK_CONFIG[block.blockType]
  if (block.blockType === 'newsletter-signup') {
    return config.label
  }
  return `${config.label} · ${block.selection.totalSlots} slots`
}
