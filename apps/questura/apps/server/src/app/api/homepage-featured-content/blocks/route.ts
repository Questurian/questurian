import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import {
  getHotelGridSelectionFromItems,
  getTourGridSelectionFromItems,
  getHomepageFeaturedSelectionFromItems,
  getLocationGridSelectionFromItems,
  getNewsletterSignupPlaceholderSelection,
  getQuesturianMapsSelectionFromItems,
  getThingsToDoAttractionsSelectionFromItems,
  getThingsToDoListiclesSelectionFromItems,
  getWhereToEatDrinkSelectionFromItems,
  curatedBlockApiPayload,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
  homepageBlockSupportsSectionHeading,
  HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
  HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
  HOMEPAGE_TOUR_GRID_MAX_SLOTS,
  HOMEPAGE_TOUR_GRID_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
  LOCATION_GRID_MAX_SLOTS,
  LOCATION_GRID_MIN_SLOTS,
  MAIN_LOCATION_GRID_SCOPE,
  isValidRequestedSlotCount,
  resolveStoredSlotCountForBlockType,
} from '@/features/homepage-featured-content'
import { reorderBlocksByIds } from '@/features/homepage-featured-content/reorder-blocks'
import {
  HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
  HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
} from '@/features/homepage-featured-content/types'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function wantsLeanResponse(req: NextRequest): boolean {
  return new URL(req.url).searchParams.get('response') === 'lean'
}

type RawBlock = {
  id: string
  blockType: string
  slotCount?: number
  sectionHeading?: string | null
  sectionSubheading?: string | null
  items?: unknown
}

type MainHomepageGlobalDoc = {
  pageBlocks?: RawBlock[]
}

const SUPPORTED_BLOCK_TYPES = [
  'featured-article',
  'featured-article-carousel',
  'featured-articles',
  'article-grid',
  'location-grid',
  'questurian-maps',
  'hotel-grid',
  'tour-grid',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'things-to-do-attractions',
  'newsletter-signup',
  'article-list',
] as const
type SupportedBlockType = (typeof SUPPORTED_BLOCK_TYPES)[number]
const BLOCK_SLOT_LIMITS: Record<SupportedBlockType, { min: number; max: number }> = {
  'featured-article': { min: 1, max: 1 },
  'featured-article-carousel': { min: 2, max: 10 },
  'featured-articles': { min: 3, max: 9 },
  'article-grid': { min: 4, max: 8 },
  'location-grid': { min: LOCATION_GRID_MIN_SLOTS, max: LOCATION_GRID_MAX_SLOTS },
  'questurian-maps': {
    min: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
    max: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
  },
  'hotel-grid': { min: HOMEPAGE_HOTEL_GRID_MIN_SLOTS, max: HOMEPAGE_HOTEL_GRID_MAX_SLOTS },
  'tour-grid': { min: HOMEPAGE_TOUR_GRID_MIN_SLOTS, max: HOMEPAGE_TOUR_GRID_MAX_SLOTS },
  'where-to-eat-drink': {
    min: HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
    max: HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  },
  'things-to-do-listicles': {
    min: HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
    max: HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  },
  'things-to-do-attractions': {
    min: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
    max: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  },
  'newsletter-signup': { min: 0, max: 0 },
  'article-list': { min: 5, max: 25 },
}

function isCuratedBlockType(value: unknown): value is SupportedBlockType {
  return SUPPORTED_BLOCK_TYPES.includes(value as SupportedBlockType)
}

// POST /api/homepage-featured-content/blocks — add a new block
export async function POST(req: NextRequest) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor'],
    })

    if (authResult.error) {
      return NextResponse.json({ message: authResult.error }, { status: authResult.status, headers })
    }

    const body = await req.json().catch(() => null)
    const blockType: unknown = body?.blockType

    if (!isCuratedBlockType(blockType)) {
      return NextResponse.json(
        { message: `Unsupported blockType. Supported types: ${SUPPORTED_BLOCK_TYPES.join(', ')}.` },
        { status: 400, headers },
      )
    }

    const rawSlotCount = body?.slotCount
    const slotLimits = BLOCK_SLOT_LIMITS[blockType]

    let slotCount: number | null = null
    if (typeof rawSlotCount === 'number' && Number.isFinite(rawSlotCount)) {
      const n = Math.trunc(rawSlotCount)
      if (isValidRequestedSlotCount(blockType, n)) {
        slotCount = n
      }
    } else if (slotLimits.min === slotLimits.max) {
      slotCount = slotLimits.min
    }

    if (slotCount === null) {
      const message =
        blockType === 'article-grid'
          ? `slotCount must be 4 or 8 for "${blockType}".`
          : `slotCount must be between ${slotLimits.min} and ${slotLimits.max} for "${blockType}".`
      return NextResponse.json({ message }, { status: 400, headers })
    }

    const payload = await getPayload({ config })

    const globalDoc = (await payload.findGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      depth: 0,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const existingBlocks: RawBlock[] = globalDoc.pageBlocks ?? []
    const newBlock: Record<string, unknown> = {
      blockType: blockType as SupportedBlockType,
      slotCount,
      items: [],
    }
    if (homepageBlockSupportsSectionHeading(blockType)) {
      const sh = body?.sectionHeading
      if (typeof sh === 'string') {
        const t = sh.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX)
        if (t) newBlock.sectionHeading = t
      }
      const ss = body?.sectionSubheading
      if (typeof ss === 'string') {
        const t = ss.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX)
        if (t) newBlock.sectionSubheading = t
      }
    }

    const updated = (await payload.updateGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      data: { pageBlocks: [...existingBlocks, newBlock] } as any,
      depth: 1,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const resolvedBlocks = await Promise.all(
      (updated.pageBlocks ?? []).map(async (block) => {
        if (isCuratedBlockType(block.blockType)) {
          const slotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
          const selection = block.blockType === 'location-grid'
            ? await getLocationGridSelectionFromItems(payload, block.items, {
                totalSlots: slotCount,
                scope: MAIN_LOCATION_GRID_SCOPE,
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

    return NextResponse.json({ pageBlocks: resolvedBlocks }, { status: 201, headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to add block to main homepage.') },
      { status: 400, headers },
    )
  }
}

// DELETE /api/homepage-featured-content/blocks — delete a block
// Body: { blockId: string }
export async function DELETE(req: NextRequest) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor'],
    })

    if (authResult.error) {
      return NextResponse.json({ message: authResult.error }, { status: authResult.status, headers })
    }

    const body = await req.json().catch(() => null)
    const blockId: unknown = body?.blockId

    if (typeof blockId !== 'string' || blockId.trim().length === 0) {
      return NextResponse.json(
        { message: 'blockId (string) is required.' },
        { status: 400, headers },
      )
    }

    const payload = await getPayload({ config })

    const globalDoc = (await payload.findGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      depth: 0,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const existingBlocks: RawBlock[] = globalDoc.pageBlocks ?? []
    const updatedBlocks = existingBlocks.filter((block) => block.id !== blockId)

    if (updatedBlocks.length === existingBlocks.length) {
      return NextResponse.json(
        { message: `Block ${blockId} not found in main homepage.` },
        { status: 404, headers },
      )
    }

    const leanResponse = wantsLeanResponse(req)
    const updated = (await payload.updateGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      data: { pageBlocks: updatedBlocks } as any,
      depth: leanResponse ? 0 : 1,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    if (leanResponse) {
      return NextResponse.json({ deletedBlockId: blockId }, { headers })
    }

    const resolvedBlocks = await Promise.all(
      (updated.pageBlocks ?? []).map(async (block) => {
        if (isCuratedBlockType(block.blockType)) {
          const slotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
          const selection = block.blockType === 'location-grid'
            ? await getLocationGridSelectionFromItems(payload, block.items, {
                totalSlots: slotCount,
                scope: MAIN_LOCATION_GRID_SCOPE,
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

    return NextResponse.json({ pageBlocks: resolvedBlocks }, { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to delete block from main homepage.') },
      { status: 400, headers },
    )
  }
}

// PATCH /api/homepage-featured-content/blocks — reorder blocks
// Body: { orderedBlockIds: string[] }
export async function PATCH(req: NextRequest) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor'],
    })

    if (authResult.error) {
      return NextResponse.json({ message: authResult.error }, { status: authResult.status, headers })
    }

    const body = await req.json().catch(() => null)
    const payload = await getPayload({ config })

    const globalDoc = (await payload.findGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      depth: 0,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const existingBlocks: RawBlock[] = globalDoc.pageBlocks ?? []
    const reorderResult = reorderBlocksByIds(existingBlocks, body?.orderedBlockIds)

    if (!reorderResult.ok) {
      return NextResponse.json({ message: reorderResult.message }, { status: 400, headers })
    }

    const leanResponse = wantsLeanResponse(req)
    const updated = (await payload.updateGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      data: { pageBlocks: reorderResult.reordered } as any,
      depth: leanResponse ? 0 : 1,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    if (leanResponse) {
      return NextResponse.json(
        { orderedBlockIds: reorderResult.reordered.map((block) => block.id) },
        { headers },
      )
    }

    const resolvedBlocks = await Promise.all(
      (updated.pageBlocks ?? []).map(async (block) => {
        if (isCuratedBlockType(block.blockType)) {
          const slotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
          const selection = block.blockType === 'location-grid'
            ? await getLocationGridSelectionFromItems(payload, block.items, {
                totalSlots: slotCount,
                scope: MAIN_LOCATION_GRID_SCOPE,
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

    return NextResponse.json({ pageBlocks: resolvedBlocks }, { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to reorder main homepage blocks.') },
      { status: 400, headers },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
