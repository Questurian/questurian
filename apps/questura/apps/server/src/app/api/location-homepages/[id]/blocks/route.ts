import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import {
  formatHomepageDoc,
  type LocationHomepageDoc,
  parseNewBlockInput,
  type RawBlock,
  resolveLocationGridScope,
  resolvePageBlocks,
} from '@/features/homepage-featured-content'
import { reorderBlocksByIds } from '@/shared/utils/reorder-blocks'
import { getErrorMessage, wantsLeanResponse } from '@/shared/utils/api-response'

type RouteContext = { params: Promise<{ id: string }> }

async function loadHomepage(id: string, depth: 0 | 1): Promise<LocationHomepageDoc> {
  const payload = await getPayload({ config })
  return (await payload.findByID({
    collection: 'location-homepages',
    id,
    depth,
    overrideAccess: true,
  })) as unknown as LocationHomepageDoc
}

async function persistAndFormat(
  id: string,
  data: { pageBlocks: unknown[] },
  depth: 0 | 1,
): Promise<ReturnType<typeof formatHomepageDoc>> {
  const payload = await getPayload({ config })
  const updated = (await payload.update({
    collection: 'location-homepages',
    id,
    data: data as any,
    depth,
    overrideAccess: true,
  })) as unknown as LocationHomepageDoc

  const locationGridScope = await resolveLocationGridScope(payload, updated.location)
  const resolvedBlocks = await resolvePageBlocks(
    payload,
    (updated.pageBlocks ?? []) as RawBlock[],
    locationGridScope,
  )
  return formatHomepageDoc(updated, resolvedBlocks)
}

// POST /api/location-homepages/[id]/blocks — add a new block to this homepage
export async function POST(req: NextRequest, { params }: RouteContext) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor'],
    })
    if (authResult.error) {
      return NextResponse.json(
        { message: authResult.error },
        { status: authResult.status, headers },
      )
    }

    const body = await req.json().catch(() => null)
    const parsed = parseNewBlockInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ message: parsed.message }, { status: parsed.status, headers })
    }

    const { id } = await params
    const doc = await loadHomepage(id, 1)

    if (parsed.blockType === 'location-grid') {
      const payload = await getPayload({ config })
      const scope = await resolveLocationGridScope(payload, doc.location)
      if (!scope) {
        return NextResponse.json(
          { message: 'Location Grid blocks are only available on city homepages.' },
          { status: 400, headers },
        )
      }
    }

    const existingBlocks: RawBlock[] = doc.pageBlocks ?? []
    const formatted = await persistAndFormat(
      id,
      { pageBlocks: [...existingBlocks, parsed.block] },
      1,
    )

    return NextResponse.json(formatted, { status: 201, headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to add block to location homepage.') },
      { status: 400, headers },
    )
  }
}

// DELETE /api/location-homepages/[id]/blocks — delete a block from this homepage
// Body: { blockId: string }
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor'],
    })
    if (authResult.error) {
      return NextResponse.json(
        { message: authResult.error },
        { status: authResult.status, headers },
      )
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
    const leanResponse = wantsLeanResponse(req)
    const depth = leanResponse ? 0 : 1

    const doc = await loadHomepage(id, depth)
    const existingBlocks: RawBlock[] = doc.pageBlocks ?? []
    const updatedBlocks = existingBlocks.filter((block) => block.id !== blockId)

    if (updatedBlocks.length === existingBlocks.length) {
      return NextResponse.json(
        { message: `Block ${blockId} not found in this homepage.` },
        { status: 404, headers },
      )
    }

    if (leanResponse) {
      const payload = await getPayload({ config })
      await payload.update({
        collection: 'location-homepages',
        id,
        data: { pageBlocks: updatedBlocks } as any,
        depth: 0,
        overrideAccess: true,
      })
      return NextResponse.json({ deletedBlockId: blockId }, { headers })
    }

    const formatted = await persistAndFormat(id, { pageBlocks: updatedBlocks }, 1)
    return NextResponse.json(formatted, { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to delete block from location homepage.') },
      { status: 400, headers },
    )
  }
}

// PATCH /api/location-homepages/[id]/blocks — reorder blocks
// Body: { orderedBlockIds: string[] }
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor'],
    })
    if (authResult.error) {
      return NextResponse.json(
        { message: authResult.error },
        { status: authResult.status, headers },
      )
    }

    const body = await req.json().catch(() => null)
    const { id } = await params
    const leanResponse = wantsLeanResponse(req)
    const depth = leanResponse ? 0 : 1

    const doc = await loadHomepage(id, depth)
    const existingBlocks: RawBlock[] = doc.pageBlocks ?? []
    const reorderResult = reorderBlocksByIds(existingBlocks, body?.orderedBlockIds)

    if (!reorderResult.ok) {
      return NextResponse.json({ message: reorderResult.message }, { status: 400, headers })
    }

    if (leanResponse) {
      const payload = await getPayload({ config })
      await payload.update({
        collection: 'location-homepages',
        id,
        data: { pageBlocks: reorderResult.reordered } as any,
        depth: 0,
        overrideAccess: true,
      })
      return NextResponse.json(
        { orderedBlockIds: reorderResult.reordered.map((block) => block.id) },
        { headers },
      )
    }

    const formatted = await persistAndFormat(id, { pageBlocks: reorderResult.reordered }, 1)
    return NextResponse.json(formatted, { headers })
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
