import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import { getHomepageFeaturedSelectionFromItems } from '@/features/homepage-featured-content'

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

const SUPPORTED_BLOCK_TYPES = ['featured-articles'] as const
type SupportedBlockType = (typeof SUPPORTED_BLOCK_TYPES)[number]

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

    if (!SUPPORTED_BLOCK_TYPES.includes(blockType as SupportedBlockType)) {
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

    if (slotCount === null) {
      return NextResponse.json(
        { message: 'slotCount (positive integer) is required.' },
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
        if (block.blockType === 'featured-articles') {
          const selection = await getHomepageFeaturedSelectionFromItems(payload, block.items, {
            totalSlots: block.slotCount,
          })
          return { id: block.id, blockType: 'featured-articles' as const, selection }
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

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
