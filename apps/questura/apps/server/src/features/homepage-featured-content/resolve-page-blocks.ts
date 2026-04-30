import { getPayload } from 'payload'

import { curatedBlockApiPayload } from './featured-articles-section-heading'
import { getHomepageFeaturedSelectionFromItems, getNewsletterSignupPlaceholderSelection } from './service'
import { getHotelGridSelectionFromItems } from './hotel-grid-service'
import { getLocationGridSelectionFromItems, resolveLocationGridScopeFromLocation } from './location-grid-service'
import { getQuesturianMapsSelectionFromItems } from './questurian-maps-service'
import { getThingsToDoAttractionsSelectionFromItems } from './things-to-do-attractions-service'
import { getThingsToDoListiclesSelectionFromItems } from './things-to-do-listicles-service'
import { getTourGridSelectionFromItems } from './tour-grid-service'
import { getWhereToEatDrinkSelectionFromItems } from './where-to-eat-drink-service'
import { resolveStoredSlotCountForBlockType } from './slot-count-for-block-type'

export type LocationDoc = {
  id: number
  locationKey?: string
  level?: string
  countryName?: string
  cityName?: string | null
  neighborhoodName?: string | null
}

export type RawBlock = {
  id: string
  blockType: string
  slotCount?: number
  sectionHeading?: string | null
  sectionSubheading?: string | null
  slot3Layout?: string
  slot4Layout?: string
  slot5Layout?: string
  mediaAspect?: string
  articleGridFourLayout?: string
  items?: unknown
}

export type LocationHomepageDoc = {
  id: number
  isEnabled?: boolean
  updatedAt?: string
  location?: LocationDoc | number | null
  pageBlocks?: RawBlock[]
}

type CuratedBlockType =
  | 'featured-article'
  | 'featured-article-carousel'
  | 'featured-articles'
  | 'article-grid'
  | 'location-grid'
  | 'questurian-maps'
  | 'hotel-grid'
  | 'tour-grid'
  | 'where-to-eat-drink'
  | 'things-to-do-listicles'
  | 'things-to-do-attractions'
  | 'newsletter-signup'

export function isCuratedBlockType(value: unknown): value is CuratedBlockType {
  return (
    value === 'featured-article'
    || value === 'featured-article-carousel'
    || value === 'featured-articles'
    || value === 'article-grid'
    || value === 'location-grid'
    || value === 'questurian-maps'
    || value === 'hotel-grid'
    || value === 'tour-grid'
    || value === 'where-to-eat-drink'
    || value === 'things-to-do-listicles'
    || value === 'things-to-do-attractions'
    || value === 'newsletter-signup'
  )
}

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>

const PUBLIC_ARTICLE_BLOCK_TYPES = new Set([
  'featured-article',
  'featured-article-carousel',
  'featured-articles',
  'article-grid',
  'questurian-maps',
  'where-to-eat-drink',
  'things-to-do-listicles',
])

type PublicPreviewPerson = {
  id: number | null
  name: string | null
  firstName: string | null
  lastName: string | null
}

type PublicPreviewCategory = {
  id: number | null
  name: string | null
  slug: string | null
}

type PublicArticleItem = {
  title: string
  articleType: string | null
  excerpt: string | null
  author: PublicPreviewPerson | null
  category: PublicPreviewCategory | null
  imageUrl: string | null
  imageUrlSquare: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeNumericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed)
    }
  }

  return null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeTotalSlots(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0
}

function formatPublicAuthor(
  value: unknown,
  fallbackName: unknown,
): PublicPreviewPerson | null {
  if (!isRecord(value)) {
    const name = stringOrNull(fallbackName)
    return name ? { id: null, name, firstName: null, lastName: null } : null
  }

  const firstName = stringOrNull(value.firstName)
  const lastName = stringOrNull(value.lastName)
  const derivedName = [firstName, lastName].filter(Boolean).join(' ')
  const name = stringOrNull(value.name) ?? (derivedName || null)

  const author = {
    id: normalizeNumericId(value.id),
    name,
    firstName,
    lastName,
  }

  return author.id !== null || author.name || author.firstName || author.lastName ? author : null
}

function formatPublicCategory(value: unknown): PublicPreviewCategory | null {
  if (!isRecord(value)) {
    return null
  }

  const category = {
    id: normalizeNumericId(value.id),
    name: stringOrNull(value.name),
    slug: stringOrNull(value.slug),
  }

  return category.id !== null || category.name || category.slug ? category : null
}

function formatPublicArticleType(
  item: Record<string, unknown>,
  category: PublicPreviewCategory | null,
): string | null {
  const relationTo = stringOrNull(item.relationTo)

  if (relationTo === 'single-type-listicles') {
    return 'Single Type Listicle'
  }

  if (relationTo === 'listicle-itineraries') {
    return 'Itinerary'
  }

  if (relationTo === 'articles') {
    return category?.name ?? 'Standard Article'
  }

  return category?.name ?? stringOrNull(item.collectionLabel)
}

function formatPublicArticleItem(value: unknown): PublicArticleItem {
  const item = isRecord(value) ? value : {}
  const category = formatPublicCategory(item.category)

  return {
    title: stringOrNull(item.title) ?? 'Untitled',
    articleType: formatPublicArticleType(item, category),
    excerpt: stringOrNull(item.excerpt) ?? stringOrNull(item.metaDescription),
    author: formatPublicAuthor(item.author, item.authorLabel),
    category,
    imageUrl: stringOrNull(item.imageUrl),
    imageUrlSquare: stringOrNull(item.imageUrlSquare),
  }
}

function formatPublicHomepageBlock(block: unknown) {
  if (!isRecord(block) || !PUBLIC_ARTICLE_BLOCK_TYPES.has(String(block.blockType))) {
    return block
  }

  const selection = isRecord(block.selection) ? block.selection : null
  const rawItems = Array.isArray(selection?.items) ? selection.items : []

  return {
    blockType: String(block.blockType),
    totalSlots: normalizeTotalSlots(selection?.totalSlots),
    items: rawItems.map((item) => formatPublicArticleItem(item)),
  }
}

export async function resolveLocationGridScope(
  payload: PayloadInstance,
  rawLocation: LocationHomepageDoc['location'],
) {
  if (typeof rawLocation === 'object' && rawLocation !== null) {
    return resolveLocationGridScopeFromLocation(rawLocation)
  }

  if (!rawLocation) {
    return null
  }

  const location = await payload.findByID({
    collection: 'locations',
    id: rawLocation,
    depth: 0,
    overrideAccess: true,
  })

  return resolveLocationGridScopeFromLocation(
    location as { level?: unknown; locationKey?: unknown } | null,
  )
}

export async function resolvePageBlocks(
  payload: PayloadInstance,
  rawBlocks: RawBlock[],
  locationGridScope: Awaited<ReturnType<typeof resolveLocationGridScope>>,
) {
  return Promise.all(
    rawBlocks.map(async (block) => {
      if (isCuratedBlockType(block.blockType)) {
        const slotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
        const selection =
          block.blockType === 'location-grid'
            ? await getLocationGridSelectionFromItems(payload, block.items, {
                totalSlots: slotCount,
                scope: locationGridScope,
              })
            : block.blockType === 'questurian-maps'
              ? await getQuesturianMapsSelectionFromItems(payload, block.items, {
                  totalSlots: slotCount,
                })
              : block.blockType === 'hotel-grid'
                ? await getHotelGridSelectionFromItems(payload, block.items, {
                    totalSlots: slotCount,
                  })
                : block.blockType === 'tour-grid'
                  ? await getTourGridSelectionFromItems(payload, block.items, {
                      totalSlots: slotCount,
                    })
                  : block.blockType === 'where-to-eat-drink'
                    ? await getWhereToEatDrinkSelectionFromItems(payload, block.items, {
                        totalSlots: slotCount,
                      })
                    : block.blockType === 'things-to-do-listicles'
                      ? await getThingsToDoListiclesSelectionFromItems(payload, block.items, {
                          totalSlots: slotCount,
                        })
                      : block.blockType === 'things-to-do-attractions'
                        ? await getThingsToDoAttractionsSelectionFromItems(payload, block.items, {
                            totalSlots: slotCount,
                          })
                        : block.blockType === 'newsletter-signup'
                          ? getNewsletterSignupPlaceholderSelection()
                          : await getHomepageFeaturedSelectionFromItems(payload, block.items, {
                              totalSlots: slotCount,
                            })
        return curatedBlockApiPayload(block, selection)
      }

      return block
    }),
  )
}

export function formatHomepageDoc(
  doc: LocationHomepageDoc,
  resolvedBlocks: Awaited<ReturnType<typeof resolvePageBlocks>>,
) {
  const location =
    typeof doc.location === 'object' && doc.location !== null ? doc.location : null

  return {
    id: doc.id,
    isEnabled: doc.isEnabled ?? false,
    location: location
      ? {
          id: location.id,
          locationKey: location.locationKey ?? null,
          level: location.level ?? null,
          countryName: location.countryName ?? null,
          cityName: location.cityName ?? null,
          neighborhoodName: location.neighborhoodName ?? null,
        }
      : null,
    pageBlocks: resolvedBlocks,
  }
}

export function formatPublicLocationHomepageDoc(
  resolvedBlocks: Awaited<ReturnType<typeof resolvePageBlocks>>,
) {
  return {
    pageBlocks: resolvedBlocks.map((block) => formatPublicHomepageBlock(block)),
  }
}
