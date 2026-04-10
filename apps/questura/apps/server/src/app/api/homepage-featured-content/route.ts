import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import {
  buildHotelGridGlobalData,
  buildThingsToDoAttractionsGlobalData,
  buildThingsToDoListiclesGlobalData,
  buildWhereToEatDrinkGlobalData,
  getHotelGridSelectionFromItems,
  buildLocationGridGlobalData,
  getLocationGridSelectionFromItems,
  getThingsToDoAttractionsSelectionFromItems,
  getThingsToDoListiclesSelectionFromItems,
  getWhereToEatDrinkSelectionFromItems,
  normalizeHotelGridInput,
  MAIN_LOCATION_GRID_SCOPE,
  normalizeLocationGridInput,
  normalizeThingsToDoAttractionsInput,
  normalizeThingsToDoListiclesInput,
  normalizeWhereToEatDrinkInput,
  validateHotelGridItems,
  validateLocationGridItems,
  validateThingsToDoAttractionsItems,
  validateThingsToDoListiclesItems,
  validateWhereToEatDrinkItems,
  buildHomepageFeaturedGlobalData,
  getHomepageFeaturedSelectionFromItems,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from '@/features/homepage-featured-content'
import { APP_CONFIG } from '@/shared/config'
import {
  HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
  HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
  HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
  HOMEPAGE_FEATURED_ARTICLE_SLOT_COUNT,
  HOMEPAGE_FEATURED_CONTENT_SLOTS,
  getPageBlocksFieldName,
  mergeHomepageBlockFields,
  parseHomepageEditorModeParam,
} from '@/features/homepage-featured-content/types'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

type RawBlock = {
  id: string
  blockType: string
  slotCount?: number
  items?: unknown
}

type MainHomepageGlobalDoc = {
  pageBlocks?: RawBlock[]
  pageBlocksStay?: RawBlock[]
  pageBlocksMove?: RawBlock[]
}

function isCuratedBlockType(
  value: unknown,
): value is
  | 'featured-article'
  | 'featured-articles'
  | 'article-grid'
  | 'location-grid'
  | 'hotel-grid'
  | 'where-to-eat-drink'
  | 'things-to-do-listicles'
  | 'things-to-do-attractions' {
  return value === 'featured-article'
    || value === 'featured-articles'
    || value === 'article-grid'
    || value === 'location-grid'
    || value === 'hotel-grid'
    || value === 'where-to-eat-drink'
    || value === 'things-to-do-listicles'
    || value === 'things-to-do-attractions'
}

async function resolvePageBlocks(
  payload: Awaited<ReturnType<typeof getPayload>>,
  rawBlocks: RawBlock[],
) {
  return Promise.all(
    rawBlocks.map(async (block) => {
      if (isCuratedBlockType(block.blockType)) {
        const selection = block.blockType === 'location-grid'
          ? await getLocationGridSelectionFromItems(payload, block.items, {
              totalSlots: block.slotCount,
              scope: MAIN_LOCATION_GRID_SCOPE,
            })
          : block.blockType === 'hotel-grid'
            ? await getHotelGridSelectionFromItems(payload, block.items, {
                totalSlots: block.slotCount,
              })
            : block.blockType === 'where-to-eat-drink'
              ? await getWhereToEatDrinkSelectionFromItems(payload, block.items, {
                  totalSlots: block.slotCount,
                })
              : block.blockType === 'things-to-do-listicles'
                ? await getThingsToDoListiclesSelectionFromItems(payload, block.items, {
                    totalSlots: block.slotCount,
                  })
                : block.blockType === 'things-to-do-attractions'
                  ? await getThingsToDoAttractionsSelectionFromItems(payload, block.items, {
                      totalSlots: block.slotCount,
                    })
            : await getHomepageFeaturedSelectionFromItems(payload, block.items, {
                totalSlots: block.slotCount,
              })
        return { id: block.id, blockType: block.blockType, selection }
      }
      return block
    }),
  )
}

// GET /api/homepage-featured-content — return page blocks for mode (?mode=explore|stay|move)
export async function GET(req: NextRequest) {
  const headers = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })
    const mode = parseHomepageEditorModeParam(req.nextUrl.searchParams.get('mode'))
    const field = getPageBlocksFieldName(mode)

    const globalDoc = (await payload.findGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      depth: 1,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const rawForMode = globalDoc[field] ?? []
    const resolvedBlocks = await resolvePageBlocks(payload, rawForMode)

    return NextResponse.json({ pageBlocks: resolvedBlocks, mode }, { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to load main homepage.') },
      { status: 500, headers },
    )
  }
}

// PUT /api/homepage-featured-content — update a specific block's items
// Body: { blockId: string, items: HomepageFeaturedItemRef[] }
export async function PUT(req: NextRequest) {
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

    if (!body?.blockId || !Array.isArray(body?.items)) {
      return NextResponse.json(
        { message: 'blockId (string) and items (array) are required.' },
        { status: 400, headers },
      )
    }

    const payload = await getPayload({ config })
    const mode = parseHomepageEditorModeParam(req.nextUrl.searchParams.get('mode'))
    const field = getPageBlocksFieldName(mode)

    const globalDoc = (await payload.findGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      depth: 0,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const rawBlocks: RawBlock[] = globalDoc[field] ?? []
    const blockIndex = rawBlocks.findIndex((b) => b.id === body.blockId)

    if (blockIndex === -1) {
      return NextResponse.json(
        { message: `Block ${body.blockId} not found in main homepage.` },
        { status: 404, headers },
      )
    }

    const block = rawBlocks[blockIndex]

    if (!isCuratedBlockType(block.blockType)) {
      return NextResponse.json(
        { message: `Block type "${block.blockType}" does not support item updates via this endpoint.` },
        { status: 400, headers },
      )
    }

    const blockSlotCount =
      block.blockType === 'featured-article'
        ? HOMEPAGE_FEATURED_ARTICLE_SLOT_COUNT
        : typeof block.slotCount === 'number' && block.slotCount >= 1
          ? Math.trunc(block.slotCount)
          : HOMEPAGE_FEATURED_CONTENT_SLOTS

    if (block.blockType === 'location-grid') {
      const refs = normalizeLocationGridInput(body.items)
      const validatedRefs = await validateLocationGridItems(payload, refs, {
        scope: MAIN_LOCATION_GRID_SCOPE,
        slotCount: blockSlotCount,
      })

      rawBlocks[blockIndex] = { ...block, ...buildLocationGridGlobalData(validatedRefs) }
    } else if (block.blockType === 'hotel-grid') {
      if (
        blockSlotCount < HOMEPAGE_HOTEL_GRID_MIN_SLOTS
        || blockSlotCount > HOMEPAGE_HOTEL_GRID_MAX_SLOTS
      ) {
        return NextResponse.json(
          {
            message: `slotCount must be between ${HOMEPAGE_HOTEL_GRID_MIN_SLOTS} and ${HOMEPAGE_HOTEL_GRID_MAX_SLOTS} for "hotel-grid".`,
          },
          { status: 400, headers },
        )
      }

      const refs = normalizeHotelGridInput(body.items)
      const validatedRefs = await validateHotelGridItems(payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount: blockSlotCount,
      })
      rawBlocks[blockIndex] = { ...block, ...buildHotelGridGlobalData(validatedRefs) }
    } else if (block.blockType === 'where-to-eat-drink') {
      if (
        blockSlotCount < HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS
        || blockSlotCount > HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS
      ) {
        return NextResponse.json(
          {
            message: `slotCount must be between ${HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS} and ${HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS} for "where-to-eat-drink".`,
          },
          { status: 400, headers },
        )
      }

      const refs = normalizeWhereToEatDrinkInput(body.items)
      const validatedRefs = await validateWhereToEatDrinkItems(payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount: blockSlotCount,
      })
      rawBlocks[blockIndex] = { ...block, ...buildWhereToEatDrinkGlobalData(validatedRefs) }
    } else if (block.blockType === 'things-to-do-listicles') {
      if (
        blockSlotCount < HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS
        || blockSlotCount > HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS
      ) {
        return NextResponse.json(
          {
            message: `slotCount must be between ${HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS} and ${HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS} for "things-to-do-listicles".`,
          },
          { status: 400, headers },
        )
      }

      const refs = normalizeThingsToDoListiclesInput(body.items)
      const validatedRefs = await validateThingsToDoListiclesItems(payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount: blockSlotCount,
      })
      rawBlocks[blockIndex] = { ...block, ...buildThingsToDoListiclesGlobalData(validatedRefs) }
    } else if (block.blockType === 'things-to-do-attractions') {
      if (
        blockSlotCount < HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS
        || blockSlotCount > HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS
      ) {
        return NextResponse.json(
          {
            message: `slotCount must be between ${HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS} and ${HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS} for "things-to-do-attractions".`,
          },
          { status: 400, headers },
        )
      }

      const refs = normalizeThingsToDoAttractionsInput(body.items)
      const validatedRefs = await validateThingsToDoAttractionsItems(payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount: blockSlotCount,
      })
      rawBlocks[blockIndex] = { ...block, ...buildThingsToDoAttractionsGlobalData(validatedRefs) }
    } else {
      const refs = normalizeHomepageFeaturedInput(body.items)
      const validatedRefs = await validateHomepageFeaturedItems(payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount: blockSlotCount,
      })

      rawBlocks[blockIndex] = { ...block, ...buildHomepageFeaturedGlobalData(validatedRefs) }
    }

    const updatedBlocks = rawBlocks
    const mergeData = mergeHomepageBlockFields(globalDoc, field, updatedBlocks)

    const updated = (await payload.updateGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      data: mergeData as any,
      depth: 0,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const resolvedBlocks = await resolvePageBlocks(payload, updated[field] ?? [])

    return NextResponse.json({ pageBlocks: resolvedBlocks, mode }, { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to update main homepage block.') },
      { status: 400, headers },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
