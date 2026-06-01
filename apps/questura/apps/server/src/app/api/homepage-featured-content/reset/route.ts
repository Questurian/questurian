import { NextRequest, NextResponse } from 'next/server'

import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import { resetAllHomepageContent } from '@/features/homepage-featured-content'
import { getErrorMessage } from '@/shared/utils/api-response'

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

    return NextResponse.json(await resetAllHomepageContent(), { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to clear homepage content.') },
      { status: 500, headers },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
