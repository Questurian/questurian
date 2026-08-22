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
  'featured-creator-article': {
    label: 'Creator Feature',
    description:
      'Same dark hero as Hero Article, with the author portrait above the title — for creator collaborations',
    quickSlotCounts: [1],
    defaultSlotCount: 1,
    minSlotCount: 1,
    maxSlotCount: 1,
    order: 5.5,
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
  'editorial-feature': {
    label: 'Editorial Feature',
    description:
      'Custom feature image and copy with 2, 3, 4, or 6 related articles',
    quickSlotCounts: [2, 3, 4, 6],
    defaultSlotCount: 3,
    minSlotCount: 2,
    maxSlotCount: 6,
    validSlotCounts: [2, 3, 4, 6],
    order: 0.5,
    articlePayload: true,
    convertTarget: true
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

/** Block types edited with {@link CuratedHomepageBlockEditor}; empty blocks may convert to another type. */
export const ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES = pageBlockTypesWhere(
  (definition) => definition.articlePayload
) as ArticleCuratedHomepageBlockType[]

/** Membership sets derived from the registry, used by the block type guards. */
export const HOMEPAGE_PAGE_BLOCK_TYPE_SET = new Set<string>(
  Object.keys(PAGE_BLOCK_DEFINITIONS)
)
export const ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPE_SET = new Set<string>(
  ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES
)
