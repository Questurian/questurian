import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import {
  buildHomepageFeaturedGlobalData,
  getHomepageFeaturedSelectionFromItems,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from '@/features/homepage-featured-content'
import { APP_CONFIG } from '@/shared/config'
import {
  HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
  HOMEPAGE_FEATURED_CONTENT_SLOTS,
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

async function resolvePageBlocks(
  payload: Awaited<ReturnType<typeof getPayload>>,
  rawBlocks: RawBlock[],
) {
  return Promise.all(
    rawBlocks.map(async (block) => {
      if (block.blockType === 'featured-articles') {
        const selection = await getHomepageFeaturedSelectionFromItems(payload, block.items, {
          totalSlots: block.slotCount,
        })
        return { id: block.id, blockType: 'featured-articles' as const, selection }
      }
      return block
    }),
  )
}

// GET /api/homepage-featured-content — return all page blocks
export async function GET(req: NextRequest) {
  const headers = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })

    const globalDoc = (await payload.findGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      depth: 1,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const resolvedBlocks = await resolvePageBlocks(payload, globalDoc.pageBlocks ?? [])

    return NextResponse.json({ pageBlocks: resolvedBlocks }, { headers })
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

    const globalDoc = (await payload.findGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      depth: 0,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const rawBlocks: RawBlock[] = globalDoc.pageBlocks ?? []
    const blockIndex = rawBlocks.findIndex((b) => b.id === body.blockId)

    if (blockIndex === -1) {
      return NextResponse.json(
        { message: `Block ${body.blockId} not found in main homepage.` },
        { status: 404, headers },
      )
    }

    const block = rawBlocks[blockIndex]

    if (block.blockType !== 'featured-articles') {
      return NextResponse.json(
        { message: `Block type "${block.blockType}" does not support item updates via this endpoint.` },
        { status: 400, headers },
      )
    }

    const blockSlotCount =
      typeof block.slotCount === 'number' && block.slotCount >= 1
        ? Math.trunc(block.slotCount)
        : HOMEPAGE_FEATURED_CONTENT_SLOTS

    const refs = normalizeHomepageFeaturedInput(body.items)
    const validatedRefs = await validateHomepageFeaturedItems(payload, refs, {
      allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
      slotCount: blockSlotCount,
    })

    const updatedBlocks = rawBlocks.map((b, i) =>
      i === blockIndex
        ? { ...b, ...buildHomepageFeaturedGlobalData(validatedRefs) }
        : b,
    )

    const updated = (await payload.updateGlobal({
      slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pageBlocks: updatedBlocks } as any,
      depth: 0,
      overrideAccess: true,
    })) as MainHomepageGlobalDoc

    const resolvedBlocks = await resolvePageBlocks(payload, updated.pageBlocks ?? [])

    return NextResponse.json({ pageBlocks: resolvedBlocks }, { headers })
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
