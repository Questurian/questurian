import { NextRequest, NextResponse } from 'next/server'

import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import {
  addLocationHomepageBlock,
  deleteLocationHomepageBlock,
  type LocationHomepageBlocksOperationResult,
  reorderLocationHomepageBlocks,
} from '@/features/homepage-featured-content'
import { getErrorMessage, wantsLeanResponse } from '@/shared/utils/api-response'

type RouteContext = { params: Promise<{ id: string }> }
type BlocksMutationArgs = { id: string; body: unknown; leanResponse: boolean }
type BlocksMutation = (
  args: BlocksMutationArgs,
) => Promise<LocationHomepageBlocksOperationResult>

async function handleBlocksMutation(
  req: NextRequest,
  { params }: RouteContext,
  mutation: BlocksMutation,
  fallbackMessage: string,
): Promise<NextResponse> {
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

    const body = await readJsonBody(req)
    const { id } = await params
    const result = await mutation({ id, body, leanResponse: wantsLeanResponse(req) })

    return NextResponse.json(result.body, { status: result.status, headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, fallbackMessage) },
      { status: 400, headers },
    )
  }
}

async function readJsonBody(req: NextRequest): Promise<unknown> {
  return req.json().catch(() => null)
}

// POST /api/location-homepages/[id]/blocks - add a new block to this homepage
export async function POST(req: NextRequest, { params }: RouteContext) {
  return handleBlocksMutation(
    req,
    { params },
    ({ id, body }) => addLocationHomepageBlock(id, body),
    'Failed to add block to location homepage.',
  )
}

// DELETE /api/location-homepages/[id]/blocks - delete a block from this homepage
// Body: { blockId: string }
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  return handleBlocksMutation(
    req,
    { params },
    ({ id, body, leanResponse }) => deleteLocationHomepageBlock(id, body, leanResponse),
    'Failed to delete block from location homepage.',
  )
}

// PATCH /api/location-homepages/[id]/blocks - reorder blocks
// Body: { orderedBlockIds: string[] }
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  return handleBlocksMutation(
    req,
    { params },
    ({ id, body, leanResponse }) => reorderLocationHomepageBlocks(id, body, leanResponse),
    'Failed to reorder location homepage blocks.',
  )
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
