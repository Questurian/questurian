import { NextRequest, NextResponse } from 'next/server'

import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import {
  getMainHomepage,
  updateMainHomepageBlockContent,
} from '@/features/homepage-featured-content'
import { getErrorMessage } from '@/shared/utils/api-response'

async function authenticate(req: NextRequest, headers: HeadersInit): Promise<NextResponse | null> {
  const authResult = await authenticateRequest(req, {
    requireAuth: true,
    allowedRoles: ['admin', 'editor'],
  })

  return authResult.error
    ? NextResponse.json({ message: authResult.error }, { status: authResult.status, headers })
    : null
}

export async function GET(req: NextRequest) {
  const headers = getCorsHeaders(req)
  try {
    const authResponse = await authenticate(req, headers)
    if (authResponse) return authResponse
    const result = await getMainHomepage()
    return NextResponse.json(result.body, { status: result.status, headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to load main homepage.') },
      { status: 500, headers },
    )
  }
}

export async function PUT(req: NextRequest) {
  const headers = getCorsHeaders(req)
  try {
    const authResponse = await authenticate(req, headers)
    if (authResponse) return authResponse
    const result = await updateMainHomepageBlockContent(await req.json().catch(() => null))
    return NextResponse.json(result.body, { status: result.status, headers })
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
