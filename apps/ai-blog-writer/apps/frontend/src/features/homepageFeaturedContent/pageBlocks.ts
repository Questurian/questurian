import type { HomepageFeaturedSelection } from './types'
import type {
  HomepageLocationGridSelection,
  LocationGridMediaAspect
} from './locationGridTypes'
import type { HomepageHotelGridSelection } from './hotelGridTypes'

export type CuratedHomepageBlockConfig = {
  label: string
  description: string
  quickSlotCounts: readonly number[]
  defaultSlotCount: number
  minSlotCount: number
  maxSlotCount: number
}

type PageBlockDefinition = CuratedHomepageBlockConfig & {
  order: number
  articlePayload: boolean
  convertTarget: boolean
  validSlotCounts?: readonly number[]
}

const PAGE_BLOCK_DEFINITIONS = {
  'featured-article': {
    label: 'Hero Article',
    description: 'One full-width dark hero for a single article or listicle',
    quickSlotCounts: [1],
    defaultSlotCount: 1,
    minSlotCount: 1,
    maxSlotCount: 1,
    order: 5,
    articlePayload: true,
    convertTarget: true
  },
  'featured-article-carousel': {
    label: 'Featured Article Carousel',
    description:
      'Full-width dark hero with left/right arrows to cycle through multiple articles',
    quickSlotCounts: [2, 3, 4, 5],
    defaultSlotCount: 3,
    minSlotCount: 2,
    maxSlotCount: 10,
    order: 6,
    articlePayload: true,
    convertTarget: true
  },
  'featured-articles': {
    label: 'Multi-Article Feature',
    description: 'A curated multi-slot editorial layout for several articles',
    quickSlotCounts: [3, 4, 5, 7, 8, 9],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 9,
    validSlotCounts: [3, 4, 5, 7, 8, 9],
    order: 0,
    articlePayload: true,
    convertTarget: false
  },
  'article-grid': {
    label: 'Article Grid',
    description:
      'Square thumbnails: 4 (2×2 / four-across) or 8 (four columns × two rows)',
    quickSlotCounts: [4, 8],
    defaultSlotCount: 4,
    minSlotCount: 4,
    maxSlotCount: 8,
    validSlotCounts: [4, 8],
    order: 3,
    articlePayload: true,
    convertTarget: true
  },
  'location-grid': {
    label: 'Location Grid',
    description:
      'A child-location grid for cities on main and neighborhoods on city homepages',
    quickSlotCounts: [4, 6, 8],
    defaultSlotCount: 4,
    minSlotCount: 4,
    maxSlotCount: 8,
    order: 7,
    articlePayload: false,
    convertTarget: true
  },
  'questurian-maps': {
    label: 'Questurian Maps',
    description:
      'Six single-type listicles in a 2×3 maps grid with headline styling',
    quickSlotCounts: [6],
    defaultSlotCount: 6,
    minSlotCount: 6,
    maxSlotCount: 6,
    order: 11,
    articlePayload: true,
    convertTarget: true
  },
  'hotel-grid': {
    label: 'Hotel Grid',
    description: 'A curated hotel card grid sourced from accommodations',
    quickSlotCounts: [3, 4, 6, 8],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 12,
    order: 1,
    articlePayload: false,
    convertTarget: true
  },
  'tour-grid': {
    label: 'Tour Grid',
    description: 'A curated tour card grid sourced from tour documents',
    quickSlotCounts: [3, 4, 6, 8],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 12,
    order: 2,
    articlePayload: false,
    convertTarget: true
  },
  'where-to-eat-drink': {
    label: 'Where to Eat & Drink',
    description: 'Dining-only single-type listicles',
    quickSlotCounts: [3, 4, 6, 8],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 12,
    order: 8,
    articlePayload: true,
    convertTarget: true
  },
  'things-to-do-listicles': {
    label: 'Things to Do (Listicles)',
    description: 'Attractions single-type listicles only',
    quickSlotCounts: [3, 4, 6, 8],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 12,
    order: 10,
    articlePayload: true,
    convertTarget: true
  },
  'things-to-do-attractions': {
    label: 'Things to Do (Places)',
    description: 'A curated grid of attraction records',
    quickSlotCounts: [3, 4, 6, 8],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 12,
    order: 9,
    articlePayload: false,
    convertTarget: true
  },
  'newsletter-signup': {
    label: 'Newsletter signup',
    description:
      'Dark full-width placeholder for a future email capture section',
    quickSlotCounts: [0],
    defaultSlotCount: 0,
    minSlotCount: 0,
    maxSlotCount: 0,
    order: 12,
    articlePayload: false,
    convertTarget: true
  },
  'article-list': {
    label: 'Article List',
    description:
      'Vertical list of articles — thumbnail left, title/excerpt/author right (5–25 items)',
    quickSlotCounts: [5, 10, 15, 20],
    defaultSlotCount: 10,
    minSlotCount: 5,
    maxSlotCount: 25,
    order: 4,
    articlePayload: true,
    convertTarget: true
  }
} as const satisfies Record<string, PageBlockDefinition>

export type CuratedHomepageBlockType = keyof typeof PAGE_BLOCK_DEFINITIONS

export type ArticleCuratedHomepageBlockType = {
  [K in CuratedHomepageBlockType]: (typeof PAGE_BLOCK_DEFINITIONS)[K]['articlePayload'] extends true
    ? K
    : never
}[CuratedHomepageBlockType]

function pageBlockTypesWhere(
  predicate: (definition: PageBlockDefinition) => boolean
) {
  return (
    Object.keys(PAGE_BLOCK_DEFINITIONS) as CuratedHomepageBlockType[]
  ).filter((blockType) => predicate(PAGE_BLOCK_DEFINITIONS[blockType]))
}

export const HOMEPAGE_PAGE_BLOCK_CONFIG = Object.fromEntries(
  (
    Object.entries(PAGE_BLOCK_DEFINITIONS) as Array<
      [CuratedHomepageBlockType, PageBlockDefinition]
    >
  ).map(([blockType, definition]) => [
    blockType,
    {
      label: definition.label,
      description: definition.description,
      quickSlotCounts: definition.quickSlotCounts,
      defaultSlotCount: definition.defaultSlotCount,
      minSlotCount: definition.minSlotCount,
      maxSlotCount: definition.maxSlotCount
    }
  ])
) as Record<CuratedHomepageBlockType, CuratedHomepageBlockConfig>

/** Validates slot count when adding a block (article-grid allows only 4 or 8). */
export function isValidHomepageBlockSlotCount(
  blockType: CuratedHomepageBlockType,
  slotCount: number
): boolean {
  if (!Number.isInteger(slotCount)) return false
  const definition = PAGE_BLOCK_DEFINITIONS[blockType]
  const validSlotCounts: readonly number[] | undefined =
    'validSlotCounts' in definition ? definition.validSlotCounts : undefined
  if (validSlotCounts) {
    return validSlotCounts.includes(slotCount)
  }
  return (
    slotCount >= definition.minSlotCount && slotCount <= definition.maxSlotCount
  )
}

export const HOMEPAGE_PAGE_BLOCK_TYPES = (
  Object.keys(PAGE_BLOCK_DEFINITIONS) as CuratedHomepageBlockType[]
).sort(
  (left, right) =>
    PAGE_BLOCK_DEFINITIONS[left].order - PAGE_BLOCK_DEFINITIONS[right].order
)

/**
 * Destination types when converting an empty block (any curated editor). Section title kept when
 * supported. Excludes `featured-articles` (use Add block for that shape).
 *
 * **Sync:** Questura `homepage-empty-convert-block-types.ts` → `HOMEPAGE_EMPTY_CONVERT_SOURCE_BLOCK_TYPES`.
 * This array = valid **targets** (no `featured-articles`; add that shape via Add block). New type → update both + slot limits + editor.
 */
export const CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES =
  pageBlockTypesWhere((definition) => definition.convertTarget)

export type FeaturedArticleBlockResponse = {
  id: string
  blockType: 'featured-article'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type FeaturedArticleCarouselBlockResponse = {
  id: string
  blockType: 'featured-article-carousel'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

/** Stored on Payload for `featured-articles` when slot count is 3. */
export type FeaturedArticlesSlot3Layout = 'hero-left' | 'featured-center'

/** Stored when slot count is 4. */
export type FeaturedArticlesSlot4Layout = 'sidebar-stack' | 'one-over-three'

/** Stored when slot count is 5. */
export type FeaturedArticlesSlot5Layout = 'card-grid' | 'hero-sidebar'

export type FeaturedArticlesBlockResponse = {
  id: string
  blockType: 'featured-articles'
  selection: HomepageFeaturedSelection
  /** Optional label for this block on the public homepage (e.g. section title). */
  sectionHeading: string | null
  sectionSubheading: string | null
  /** Present when `selection.totalSlots === 3`; drives editor + public layout. */
  slot3Layout?: FeaturedArticlesSlot3Layout | null
  /** Present when `selection.totalSlots === 4`. */
  slot4Layout?: FeaturedArticlesSlot4Layout | null
  /** Present when `selection.totalSlots === 5`. */
  slot5Layout?: FeaturedArticlesSlot5Layout | null
}

/** When `selection.totalSlots === 4`: one row of four (wide images) vs 2×2 (square images). */
export type ArticleGridFourLayout = 'four-across' | 'two-by-two'

export type ArticleGridBlockResponse = {
  id: string
  blockType: 'article-grid'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
  articleGridFourLayout?: ArticleGridFourLayout | null
}

export type LocationGridBlockResponse = {
  id: string
  blockType: 'location-grid'
  selection: HomepageLocationGridSelection
  /** Optional label for this block on the public homepage (e.g. section title). */
  sectionHeading: string | null
  sectionSubheading: string | null
  /** Cover image crop: wide banner, square, or modest portrait (not full phone-tall). */
  mediaAspect?: LocationGridMediaAspect | null
}

export type QuesturianMapsBlockResponse = {
  id: string
  blockType: 'questurian-maps'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type HotelGridBlockResponse = {
  id: string
  blockType: 'hotel-grid'
  selection: HomepageHotelGridSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type TourGridBlockResponse = {
  id: string
  blockType: 'tour-grid'
  selection: HomepageHotelGridSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type WhereToEatDrinkBlockResponse = {
  id: string
  blockType: 'where-to-eat-drink'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type ThingsToDoListiclesBlockResponse = {
  id: string
  blockType: 'things-to-do-listicles'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type ThingsToDoAttractionsBlockResponse = {
  id: string
  blockType: 'things-to-do-attractions'
  selection: HomepageHotelGridSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type NewsletterSignupBlockResponse = {
  id: string
  blockType: 'newsletter-signup'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type ArticleListBlockResponse = {
  id: string
  blockType: 'article-list'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type ArticleCuratedHomepageBlockResponse =
  | FeaturedArticleBlockResponse
  | FeaturedArticleCarouselBlockResponse
  | FeaturedArticlesBlockResponse
  | ArticleGridBlockResponse
  | QuesturianMapsBlockResponse
  | WhereToEatDrinkBlockResponse
  | ThingsToDoListiclesBlockResponse
  | ArticleListBlockResponse

/** Block types edited with {@link CuratedHomepageBlockEditor}; empty blocks may convert to another type. */
export const ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES = pageBlockTypesWhere(
  (definition) => definition.articlePayload
) as ArticleCuratedHomepageBlockType[]

export type CuratedHomepageBlockResponse =
  | ArticleCuratedHomepageBlockResponse
  | LocationGridBlockResponse
  | HotelGridBlockResponse
  | TourGridBlockResponse
  | ThingsToDoAttractionsBlockResponse
  | NewsletterSignupBlockResponse

export type UnknownBlockResponse = {
  id: string
  blockType: string
}

export type BlockPublishStatus = 'live' | 'modified' | 'unpublished'
export type BlockValidationStatus = 'publishable' | 'blocked'

/** Per-block draft-vs-published metadata attached by the server formatter. */
export type BlockPublishMeta = {
  publishStatus?: BlockPublishStatus
  validationStatus?: BlockValidationStatus
  publishBlockers?: string[]
}

export type PageBlockResponse = (
  | CuratedHomepageBlockResponse
  | UnknownBlockResponse
) &
  BlockPublishMeta

const HOMEPAGE_PAGE_BLOCK_TYPE_SET = new Set<string>(
  Object.keys(PAGE_BLOCK_DEFINITIONS)
)
const ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPE_SET = new Set<string>(
  ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES
)

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

export type HotelOrAttractionGridBlockResponse =
  | HotelGridBlockResponse
  | TourGridBlockResponse
  | ThingsToDoAttractionsBlockResponse

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
