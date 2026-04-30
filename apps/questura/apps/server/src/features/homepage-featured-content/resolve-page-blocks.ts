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
