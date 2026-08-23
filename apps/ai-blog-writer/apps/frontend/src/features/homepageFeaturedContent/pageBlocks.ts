/**
 * Public surface for homepage page blocks.
 *
 * Kept as a barrel because ~31 modules import from it. The pieces live in:
 * - pageBlocks.definitions.ts — the block registry and everything derived from it
 * - pageBlocks.responses.ts   — the per-block server response shapes
 * - pageBlocks.guards.ts      — type guards, identity keys, label formatting
 */

export type {
  ArticleCuratedHomepageBlockType,
  CuratedHomepageBlockConfig,
  CuratedHomepageBlockType,
  GrowingCarouselBlockType
} from './pageBlocks.definitions'
export {
  ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES,
  CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  HOMEPAGE_PAGE_BLOCK_TYPES,
  isHomepageBlockFrontendReady,
  isGrowingCarouselBlockType,
  isValidHomepageBlockSlotCount
} from './pageBlocks.definitions'

export type {
  ArticleCuratedHomepageBlockResponse,
  ArticleGridBlockResponse,
  ArticleGridFourLayout,
  ArticleListBlockResponse,
  BlockPublishMeta,
  BlockPublishStatus,
  BlockValidationStatus,
  CuratedHomepageBlockResponse,
  FeaturedArticleBlockResponse,
  FeaturedCreatorArticleBlockResponse,
  FeaturedArticleCarouselBlockResponse,
  FeaturedArticlesBlockResponse,
  EditorialFeatureBlockResponse,
  EditorialFeatureLinkedLocation,
  EditorialFeaturePublicImage,
  FeaturedArticlesSlot3Layout,
  FeaturedArticlesSlot4Layout,
  FeaturedArticlesSlot5Layout,
  HotelGridBlockResponse,
  HotelOrAttractionGridBlockResponse,
  LocationGridBlockResponse,
  NewsletterSignupBlockResponse,
  PageBlockResponse,
  QuesturianMapsBlockResponse,
  ThingsToDoAttractionsBlockResponse,
  ThingsToDoListiclesBlockResponse,
  TourGridBlockResponse,
  UnknownBlockResponse,
  WhereToEatDrinkBlockResponse
} from './pageBlocks.responses'

export {
  formatHomepageBlockTypeTagLabel,
  homepageBlockEditorIdentity,
  homepageBlockShapeIdentity,
  isArticleCuratedHomepageBlock,
  isEditorialFeatureBlock,
  isCuratedHomepageBlock,
  isHotelGridBlock,
  isLocationGridBlock,
  isNewsletterSignupBlock,
  isThingsToDoAttractionsBlock,
  isTourGridBlock
} from './pageBlocks.guards'
