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
  getHomepageFeaturedSelectionFromItems,
  getLocationGridSelectionFromItems,
  getQuesturianMapsSelectionFromItems,
  getThingsToDoAttractionsSelectionFromItems,
  getThingsToDoListiclesSelectionFromItems,
  getWhereToEatDrinkSelectionFromItems,
  HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
  HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
  LOCATION_GRID_MAX_SLOTS,
  LOCATION_GRID_MIN_SLOTS,
  resolveLocationGridScopeFromLocation,
  curatedBlockApiPayload,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  resolveStoredSlotCountForBlockType,
} from '@/features/homepage-featured-content'
import { reorderBlocksByIds } from '@/features/homepage-featured-content/reorder-blocks'
import {
  getPageBlocksFieldName,
  HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
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
  sectionHeading?: string | null
  items?: unknown
}

type LocationHomepageDoc = {
  id: number
  isEnabled?: boolean
  location?: unknown
  pageBlocks?: RawBlock[]
  pageBlocksStay?: RawBlock[]
  pageBlocksMove?: RawBlock[]
}

const SUPPORTED_BLOCK_TYPES = [
  'featured-article',
  'featured-articles',
  'article-grid',
  'location-grid',
  'questurian-maps',
  'hotel-grid',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'things-to-do-attractions',
] as const
type SupportedBlockType = (typeof SUPPORTED_BLOCK_TYPES)[number]
const BLOCK_SLOT_LIMITS: Record<SupportedBlockType, { min: number; max: number }> = {
  'featured-article': { min: 1, max: 1 },
  'featured-articles': { min: 3, max: 9 },
  'article-grid': { min: 3, max: 5 },
  'location-grid': { min: LOCATION_GRID_MIN_SLOTS, max: LOCATION_GRID_MAX_SLOTS },
  'questurian-maps': {
    min: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
    max: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
  },
  'hotel-grid': { min: HOMEPAGE_HOTEL_GRID_MIN_SLOTS, max: HOMEPAGE_HOTEL_GRID_MAX_SLOTS },
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
}

function isCuratedBlockType(value: unknown): value is SupportedBlockType {
  return SUPPORTED_BLOCK_TYPES.includes(value as SupportedBlockType)
}

// POST /api/location-homepages/[id]/blocks — add a new block to this homepage
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
        {
          message: `Unsupported blockType. Supported types: ${SUPPORTED_BLOCK_TYPES.join(', ')}.`,
        },
        { status: 400, headers },
      )
    }

    const rawSlotCount = body?.slotCount
    const slotCount = typeof rawSlotCount === 'number' && Number.isFinite(rawSlotCount) && rawSlotCount >= 1
      ? Math.trunc(rawSlotCount)
      : null
    const slotLimits = BLOCK_SLOT_LIMITS[blockType]

    if (
      slotCount === null ||
      slotCount < slotLimits.min ||
      slotCount > slotLimits.max
    ) {
      return NextResponse.json(
        {
          message: `slotCount must be between ${slotLimits.min} and ${slotLimits.max} for "${blockType}".`,
        },
        { status: 400, headers },
      )
    }

    const { id } = await params
    const payload = await getPayload({ config })
    const mode = parseHomepageEditorModeParam(req.nextUrl.searchParams.get('mode'))
    const field = getPageBlocksFieldName(mode)

    const doc = (await payload.findByID({
      collection: 'location-homepages',
      id,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const existingBlocks: RawBlock[] = doc[field] ?? []
    const rawLocation =
      typeof doc.location === 'object' && doc.location !== null
        ? doc.location as { level?: unknown; locationKey?: unknown; id?: unknown }
        : null
    const locationGridScope = resolveLocationGridScopeFromLocation(rawLocation)

    if (blockType === 'location-grid' && !locationGridScope) {
      return NextResponse.json(
        {
          message:
            'Location Grid blocks are only available on the main homepage and city homepages.',
        },
        { status: 400, headers },
      )
    }

    const newBlock: Record<string, unknown> = {
      blockType: blockType as SupportedBlockType,
      slotCount,
      items: [],
    }
    if (blockType === 'featured-articles' || blockType === 'location-grid') {
      const sh = body?.sectionHeading
      if (typeof sh === 'string') {
        const t = sh.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX)
        if (t) newBlock.sectionHeading = t
      }
    }
    const mergeData = mergeHomepageBlockFields(doc, field, [...existingBlocks, newBlock])

    const updated = (await payload.update({
      collection: 'location-homepages',
      id,
      data: mergeData as any,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const location =
      typeof updated.location === 'object' && updated.location !== null ? updated.location as Record<string, unknown> : null

    const resolvedBlocks = await Promise.all(
      (updated[field] ?? []).map(async (block) => {
        if (isCuratedBlockType(block.blockType)) {
          const slotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
          const selection = block.blockType === 'location-grid'
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
              : await getHomepageFeaturedSelectionFromItems(payload, block.items, {
                  totalSlots: slotCount,
                })
          return curatedBlockApiPayload(block, selection)
        }
        return block
      }),
    )

    return NextResponse.json(
      {
        id: updated.id,
        isEnabled: updated.isEnabled ?? false,
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
        mode,
      },
      { status: 201, headers },
    )
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to add block to location homepage.') },
      { status: 400, headers },
    )
  }
}

// DELETE /api/location-homepages/[id]/blocks — delete a block from this homepage
// Body: { blockId: string }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params
    const payload = await getPayload({ config })
    const mode = parseHomepageEditorModeParam(req.nextUrl.searchParams.get('mode'))
    const field = getPageBlocksFieldName(mode)

    const doc = (await payload.findByID({
      collection: 'location-homepages',
      id,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const existingBlocks: RawBlock[] = doc[field] ?? []
    const updatedBlocks = existingBlocks.filter((block) => block.id !== blockId)

    if (updatedBlocks.length === existingBlocks.length) {
      return NextResponse.json(
        { message: `Block ${blockId} not found in this homepage.` },
        { status: 404, headers },
      )
    }

    const rawLocation =
      typeof doc.location === 'object' && doc.location !== null
        ? doc.location as { level?: unknown; locationKey?: unknown; id?: unknown }
        : null
    const locationGridScope = resolveLocationGridScopeFromLocation(rawLocation)

    const mergeData = mergeHomepageBlockFields(doc, field, updatedBlocks)

    const updated = (await payload.update({
      collection: 'location-homepages',
      id,
      data: mergeData as any,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const location =
      typeof updated.location === 'object' && updated.location !== null
        ? updated.location as Record<string, unknown>
        : null

    const resolvedBlocks = await Promise.all(
      (updated[field] ?? []).map(async (block) => {
        if (isCuratedBlockType(block.blockType)) {
          const slotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
          const selection = block.blockType === 'location-grid'
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
              : await getHomepageFeaturedSelectionFromItems(payload, block.items, {
                  totalSlots: slotCount,
                })
          return curatedBlockApiPayload(block, selection)
        }
        return block
      }),
    )

    return NextResponse.json(
      {
        id: updated.id,
        isEnabled: updated.isEnabled ?? false,
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
        mode,
      },
      { headers },
    )
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to delete block from location homepage.') },
      { status: 400, headers },
    )
  }
}

// PATCH /api/location-homepages/[id]/blocks — reorder blocks
// Body: { orderedBlockIds: string[] }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const { id } = await params
    const payload = await getPayload({ config })
    const mode = parseHomepageEditorModeParam(req.nextUrl.searchParams.get('mode'))
    const field = getPageBlocksFieldName(mode)

    const doc = (await payload.findByID({
      collection: 'location-homepages',
      id,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const existingBlocks: RawBlock[] = doc[field] ?? []
    const reorderResult = reorderBlocksByIds(existingBlocks, body?.orderedBlockIds)

    if (!reorderResult.ok) {
      return NextResponse.json({ message: reorderResult.message }, { status: 400, headers })
    }

    const rawLocation =
      typeof doc.location === 'object' && doc.location !== null
        ? doc.location as { level?: unknown; locationKey?: unknown; id?: unknown }
        : null
    const locationGridScope = resolveLocationGridScopeFromLocation(rawLocation)

    const mergeData = mergeHomepageBlockFields(doc, field, reorderResult.reordered)

    const updated = (await payload.update({
      collection: 'location-homepages',
      id,
      data: mergeData as any,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const location =
      typeof updated.location === 'object' && updated.location !== null
        ? updated.location as Record<string, unknown>
        : null

    const resolvedBlocks = await Promise.all(
      (updated[field] ?? []).map(async (block) => {
        if (isCuratedBlockType(block.blockType)) {
          const slotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
          const selection = block.blockType === 'location-grid'
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
              : await getHomepageFeaturedSelectionFromItems(payload, block.items, {
                  totalSlots: slotCount,
                })
          return curatedBlockApiPayload(block, selection)
        }
        return block
      }),
    )

    return NextResponse.json(
      {
        id: updated.id,
        isEnabled: updated.isEnabled ?? false,
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
        mode,
      },
      { headers },
    )
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to reorder location homepage blocks.') },
      { status: 400, headers },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
