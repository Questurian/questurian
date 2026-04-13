export const HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG = 'homepage-featured-content'

export const HOMEPAGE_EDITOR_MODES = ['explore', 'stay', 'move'] as const
export type HomepageEditorMode = (typeof HOMEPAGE_EDITOR_MODES)[number]

export const HOMEPAGE_PAGE_BLOCKS_BY_MODE = {
  explore: 'pageBlocks',
  stay: 'pageBlocksStay',
  move: 'pageBlocksMove',
} as const satisfies Record<HomepageEditorMode, string>

export type HomepagePageBlocksFieldName =
  (typeof HOMEPAGE_PAGE_BLOCKS_BY_MODE)[HomepageEditorMode]

export const ALL_HOMEPAGE_PAGE_BLOCKS_FIELDS = [
  HOMEPAGE_PAGE_BLOCKS_BY_MODE.explore,
  HOMEPAGE_PAGE_BLOCKS_BY_MODE.stay,
  HOMEPAGE_PAGE_BLOCKS_BY_MODE.move,
] as const satisfies readonly HomepagePageBlocksFieldName[]

export function parseHomepageEditorModeParam(value: string | null | undefined): HomepageEditorMode {
  if (value === 'stay' || value === 'move') return value
  return 'explore'
}

export function getPageBlocksFieldName(mode: HomepageEditorMode): HomepagePageBlocksFieldName {
  return HOMEPAGE_PAGE_BLOCKS_BY_MODE[mode]
}

/** Merge-safe update for one mode’s blocks; copies other modes from `doc`. */
export function mergeHomepageBlockFields<T extends Partial<Record<HomepagePageBlocksFieldName, unknown[] | undefined>>>(
  doc: T,
  field: HomepagePageBlocksFieldName,
  blocks: unknown[],
): Record<HomepagePageBlocksFieldName, unknown[]> {
  const next = {} as Record<HomepagePageBlocksFieldName, unknown[]>
  for (const f of ALL_HOMEPAGE_PAGE_BLOCKS_FIELDS) {
    const existing = doc[f] as unknown[] | undefined
    next[f] = f === field ? blocks : [...(existing ?? [])]
  }
  return next
}

export const HOMEPAGE_FEATURED_CONTENT_SLOTS = 10
/** Spotlight block: exactly one curated article/listicle. */
export const HOMEPAGE_FEATURED_ARTICLE_SLOT_COUNT = 1
export const HOMEPAGE_HOTEL_GRID_MIN_SLOTS = 3
export const HOMEPAGE_HOTEL_GRID_MAX_SLOTS = 12
export const HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS = 3
export const HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS = 12
export const HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS = 3
export const HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS = 12
export const HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS = 3
export const HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS = 12
/** Questurian Maps: fixed six single-type listicle slots. */
export const HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT = 6

export const HOMEPAGE_FEATURED_CONTENT_COLLECTIONS = [
  'articles',
  'single-type-listicles',
  'listicle-itineraries',
] as const

export type HomepageFeaturedCollection = (typeof HOMEPAGE_FEATURED_CONTENT_COLLECTIONS)[number]

export type HomepageFeaturedItemRef = {
  relationTo: HomepageFeaturedCollection
  id: number
}

export type HomepageFeaturedCandidate = HomepageFeaturedItemRef & {
  slot?: number
  title: string
  slug: string | null
  status: string | null
  updatedAt: string | null
  publishedAt: string | null
  collectionLabel: string
  imageUrl: string | null
  /**
   * Square (1:1) asset URL when featured image links to a media set with a square variant,
   * or when the featured upload is the square variant. Null → UI may crop `imageUrl`.
   */
  imageUrlSquare: string | null
  /** SEO meta description when present (articles, listicles, itineraries). */
  excerpt: string | null
  /** Resolved author display name when relationship populated at depth ≥ 1. */
  authorLabel: string | null
}

export type HomepageFeaturedInvalidReason =
  | 'invalid_reference'
  | 'not_found'
  | 'not_published'

export type HomepageFeaturedInvalidItem = {
  slot: number
  relationTo?: string
  id?: number
  collectionLabel?: string
  reason: HomepageFeaturedInvalidReason
}

export type HomepageFeaturedSelection = {
  items: HomepageFeaturedCandidate[]
  invalidItems: HomepageFeaturedInvalidItem[]
  isComplete: boolean
  allowDrafts: boolean
  totalSlots: number
}

export type HomepageFeaturedCandidatesResponse = {
  docs: HomepageFeaturedCandidate[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  allowDrafts: boolean
}

export type HomepageHotelItemRef = {
  id: number
}

export type HomepageHotelCandidate = HomepageHotelItemRef & {
  slot?: number
  title: string
  slug: string | null
  type: string | null
  priceLevel: string | null
  status: string | null
  updatedAt: string | null
  imageUrl: string | null
  location: string | null
}

export type HomepageHotelInvalidReason = 'invalid_reference' | 'not_found' | 'not_published'

export type HomepageHotelInvalidItem = {
  slot: number
  id?: number
  title?: string | null
  reason: HomepageHotelInvalidReason
}

export type HomepageHotelSelection = {
  items: HomepageHotelCandidate[]
  invalidItems: HomepageHotelInvalidItem[]
  isComplete: boolean
  allowDrafts: boolean
  totalSlots: number
}

export type HomepageHotelCandidatesResponse = {
  docs: HomepageHotelCandidate[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  allowDrafts: boolean
}
