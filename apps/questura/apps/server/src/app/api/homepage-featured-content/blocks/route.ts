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
  HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
  HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
  LOCATION_GRID_MAX_SLOTS,
  LOCATION_GRID_MIN_SLOTS,
  MAIN_LOCATION_GRID_SCOPE,
} from '@/features/homepage-featured-content'
import {
  HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
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
}

const SUPPORTED_BLOCK_TYPES = ['featured-articles', 'article-grid', 'location-grid', 'hotel-grid'] as const
type SupportedBlockType = (typeof SUPPORTED_BLOCK_TYPES)[number]
const BLOCK_SLOT_LIMITS: Record<SupportedBlockType, { min: number; max: number }> = {
  'featured-articles': { min: 3, max: 9 },
  'article-grid': { min: 3, max: 5 },
  'location-grid': { min: LOCATION_GRID_MIN_SLOTS, max: LOCATION_GRID_MAX_SLOTS },
  'hotel-grid': { min: HOMEPAGE_HOTEL_GRID_MIN_SLOTS, max: HOMEPAGE_HOTEL_GRID_MAX_SLOTS },
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
    const slotCount =
      typeof rawSlotCount === 'number' && Number.isFinite(rawSlotCount) && rawSlotCount >= 1
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

    const payload = await getPayload({ config })

    const globalDoc = (await payload.findGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      depth: 0,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const existingBlocks: RawBlock[] = globalDoc.pageBlocks ?? []
    const newBlock = { blockType: blockType as SupportedBlockType, slotCount, items: [] }

    const updated = (await payload.updateGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pageBlocks: [...existingBlocks, newBlock] } as any,
      depth: 1,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const resolvedBlocks = await Promise.all(
      (updated.pageBlocks ?? []).map(async (block) => {
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
              : await getHomepageFeaturedSelectionFromItems(payload, block.items, {
                  totalSlots: block.slotCount,
                })
          return { id: block.id, blockType: block.blockType, selection }
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

    const updated = (await payload.updateGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pageBlocks: updatedBlocks } as any,
      depth: 1,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const resolvedBlocks = await Promise.all(
      (updated.pageBlocks ?? []).map(async (block) => {
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
              : await getHomepageFeaturedSelectionFromItems(payload, block.items, {
                  totalSlots: block.slotCount,
                })
          return { id: block.id, blockType: block.blockType, selection }
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

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
