import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import { getHomepageFeaturedSelectionFromItems } from '@/features/homepage-featured-content'
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

const SUPPORTED_BLOCK_TYPES = ['featured-articles'] as const
type SupportedBlockType = (typeof SUPPORTED_BLOCK_TYPES)[number]

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

    if (!SUPPORTED_BLOCK_TYPES.includes(blockType as SupportedBlockType)) {
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

    if (slotCount === null) {
      return NextResponse.json(
        { message: 'slotCount (positive integer) is required.' },
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
        if (block.blockType === 'featured-articles') {
          const selection = await getHomepageFeaturedSelectionFromItems(payload, block.items, {
            totalSlots: block.slotCount,
          })
          return { id: block.id, blockType: 'featured-articles' as const, selection }
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

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
