import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import {
  assertFeaturedArticlesBlockConvertible,
  buildConvertedHomepageBlock,
  curatedBlockApiPayload,
  getHomepageFeaturedSelectionFromItems,
  getHotelGridSelectionFromItems,
  getLocationGridSelectionFromItems,
  getQuesturianMapsSelectionFromItems,
  getThingsToDoAttractionsSelectionFromItems,
  getThingsToDoListiclesSelectionFromItems,
  getWhereToEatDrinkSelectionFromItems,
  HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
  HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
  HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
  LOCATION_GRID_MAX_SLOTS,
  LOCATION_GRID_MIN_SLOTS,
  normalizeSlotCountForBlockType,
  resolveLocationGridScopeFromLocation,
  resolveStoredSlotCountForBlockType,
} from '@/features/homepage-featured-content'
import {
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

async function resolveLocationGridScope(
  payload: Awaited<ReturnType<typeof getPayload>>,
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
    id: rawLocation as string | number,
    depth: 0,
    overrideAccess: true,
  })

  return resolveLocationGridScopeFromLocation(
    location as { level?: unknown; locationKey?: unknown } | null,
  )
}

async function resolvePageBlocks(
  payload: Awaited<ReturnType<typeof getPayload>>,
  rawBlocks: RawBlock[],
  locationGridScope: Awaited<ReturnType<typeof resolveLocationGridScope>>,
) {
  return Promise.all(
    rawBlocks.map(async (block) => {
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
}

// POST /api/location-homepages/[id]/blocks/convert
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
    const blockId: unknown = body?.blockId
    const nextBlockType: unknown = body?.blockType
    const rawSlotCount = body?.slotCount

    if (typeof blockId !== 'string' || blockId.trim().length === 0) {
      return NextResponse.json({ message: 'blockId (string) is required.' }, { status: 400, headers })
    }

    if (!isCuratedBlockType(nextBlockType) || nextBlockType === 'featured-articles') {
      return NextResponse.json(
        {
          message:
            'Provide a supported blockType other than featured-articles (e.g. article-grid, questurian-maps).',
        },
        { status: 400, headers },
      )
    }

    const slotCount =
      typeof rawSlotCount === 'number' && Number.isFinite(rawSlotCount) && rawSlotCount >= 1
        ? Math.trunc(rawSlotCount)
        : null

    if (slotCount === null) {
      return NextResponse.json(
        { message: 'slotCount (positive integer) is required.' },
        { status: 400, headers },
      )
    }

    const normalizedSlotCount = normalizeSlotCountForBlockType(nextBlockType, slotCount)
    const limits = BLOCK_SLOT_LIMITS[nextBlockType]

    if (normalizedSlotCount < limits.min || normalizedSlotCount > limits.max) {
      return NextResponse.json(
        {
          message: `slotCount must be between ${limits.min} and ${limits.max} for "${nextBlockType}".`,
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

    const rawBlocks: RawBlock[] = doc[field] ?? []
    const blockIndex = rawBlocks.findIndex((b) => b.id === blockId)

    if (blockIndex === -1) {
      return NextResponse.json(
        { message: `Block ${blockId} not found in this homepage.` },
        { status: 404, headers },
      )
    }

    const block = rawBlocks[blockIndex]

    try {
      assertFeaturedArticlesBlockConvertible(block)
    } catch (error: unknown) {
      return NextResponse.json({ message: getErrorMessage(error, 'Cannot convert block.') }, { status: 400, headers })
    }

    const locationGridScope = await resolveLocationGridScope(payload, doc.location)

    if (nextBlockType === 'location-grid' && !locationGridScope) {
      return NextResponse.json(
        {
          message:
            'Location Grid blocks are only available on the main homepage and city homepages.',
        },
        { status: 400, headers },
      )
    }

    const replacement = buildConvertedHomepageBlock(block, nextBlockType, normalizedSlotCount)
    const updatedBlocks = [...rawBlocks]
    updatedBlocks[blockIndex] = replacement as RawBlock

    const mergeData = mergeHomepageBlockFields(doc, field, updatedBlocks)

    const updated = (await payload.update({
      collection: 'location-homepages',
      id,
      data: mergeData as any,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const updatedScope = await resolveLocationGridScope(payload, updated.location)
    const resolvedBlocks = await resolvePageBlocks(payload, updated[field] ?? [], updatedScope)

    const location =
      typeof updated.location === 'object' && updated.location !== null
        ? updated.location as Record<string, unknown>
        : null

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
      { status: 200, headers },
    )
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to convert location homepage block.') },
      { status: 400, headers },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
