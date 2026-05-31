import { NextRequest, NextResponse } from 'next/server'

import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import { convertMainHomepageBlock } from '@/features/homepage-featured-content'
import { getErrorMessage, wantsLeanResponse } from '@/shared/utils/api-response'

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

    const result = await convertMainHomepageBlock(
      await req.json().catch(() => null),
      wantsLeanResponse(req),
    )
    return NextResponse.json(result.body, { status: result.status, headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to convert main homepage block.') },
      { status: 400, headers },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
