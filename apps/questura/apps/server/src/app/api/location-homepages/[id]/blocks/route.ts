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
  resolveLocationGridScopeFromLocation,
} from '@/features/homepage-featured-content'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

type RawBlock = {
  id: string
  blockType: string
  slotCount?: number
  items?: unknown
}

type LocationHomepageDoc = {
  id: number
  isEnabled?: boolean
  location?: unknown
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

    const doc = (await payload.findByID({
      collection: 'location-homepages',
      id,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const existingBlocks: RawBlock[] = doc.pageBlocks ?? []
    const rawLocation =
      typeof doc.location === 'object' && doc.location !== null
        ? doc.location as { level?: unknown; locationKey?: unknown; id?: unknown }
        : null
    const locationGridScope = resolveLocationGridScopeFromLocation(rawLocation)

    if (blockType === 'location-grid' && !locationGridScope) {
      return NextResponse.json(
        {
          message: 'Location Grid blocks are only available on the main homepage and city homepages.',
        },
        { status: 400, headers },
      )
    }

    const newBlock = { blockType: blockType as SupportedBlockType, slotCount, items: [] }

    const updated = (await payload.update({
      collection: 'location-homepages',
      id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pageBlocks: [...existingBlocks, newBlock] } as any,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const location =
      typeof updated.location === 'object' && updated.location !== null ? updated.location as Record<string, unknown> : null

    const resolvedBlocks = await Promise.all(
      (updated.pageBlocks ?? []).map(async (block) => {
        if (isCuratedBlockType(block.blockType)) {
          const selection = block.blockType === 'location-grid'
            ? await getLocationGridSelectionFromItems(payload, block.items, {
                totalSlots: block.slotCount,
                scope: locationGridScope,
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

    const doc = (await payload.findByID({
      collection: 'location-homepages',
      id,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const existingBlocks: RawBlock[] = doc.pageBlocks ?? []
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

    const updated = (await payload.update({
      collection: 'location-homepages',
      id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pageBlocks: updatedBlocks } as any,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const location =
      typeof updated.location === 'object' && updated.location !== null
        ? updated.location as Record<string, unknown>
        : null

    const resolvedBlocks = await Promise.all(
      (updated.pageBlocks ?? []).map(async (block) => {
        if (isCuratedBlockType(block.blockType)) {
          const selection = block.blockType === 'location-grid'
            ? await getLocationGridSelectionFromItems(payload, block.items, {
                totalSlots: block.slotCount,
                scope: locationGridScope,
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

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
