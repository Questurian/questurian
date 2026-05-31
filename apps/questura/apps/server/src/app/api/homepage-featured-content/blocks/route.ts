import { NextRequest, NextResponse } from 'next/server'

import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import {
  addMainHomepageBlock,
  deleteMainHomepageBlock,
  reorderMainHomepageBlocks,
} from '@/features/homepage-featured-content'
import { getErrorMessage, wantsLeanResponse } from '@/shared/utils/api-response'

async function authenticate(req: NextRequest, headers: HeadersInit): Promise<NextResponse | null> {
  const authResult = await authenticateRequest(req, {
    requireAuth: true,
    allowedRoles: ['admin', 'editor'],
  })

  return authResult.error
    ? NextResponse.json({ message: authResult.error }, { status: authResult.status, headers })
    : null
}

export async function POST(req: NextRequest) {
  const headers = getCorsHeaders(req)
  try {
    const authResponse = await authenticate(req, headers)
    if (authResponse) return authResponse
    const result = await addMainHomepageBlock(await req.json().catch(() => null))
    return NextResponse.json(result.body, { status: result.status, headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to add main homepage block.') },
      { status: 400, headers },
    )
  }
}

export async function DELETE(req: NextRequest) {
  const headers = getCorsHeaders(req)
  try {
    const authResponse = await authenticate(req, headers)
    if (authResponse) return authResponse
    const result = await deleteMainHomepageBlock(
      await req.json().catch(() => null),
      wantsLeanResponse(req),
    )
    return NextResponse.json(result.body, { status: result.status, headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to delete main homepage block.') },
      { status: 400, headers },
    )
  }
}

export async function PATCH(req: NextRequest) {
  const headers = getCorsHeaders(req)
  try {
    const authResponse = await authenticate(req, headers)
    if (authResponse) return authResponse
    const result = await reorderMainHomepageBlocks(
      await req.json().catch(() => null),
      wantsLeanResponse(req),
    )
    return NextResponse.json(result.body, { status: result.status, headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to reorder main homepage blocks.') },
      { status: 400, headers },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
