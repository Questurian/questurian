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
  getHomepageFeaturedSelection,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from '@/features/homepage-featured-content'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function GET(req: NextRequest) {
  const headers = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })
    const selection = await getHomepageFeaturedSelection(payload)

    return NextResponse.json(selection, { headers })
  } catch (error) {
    return NextResponse.json(
      {
        message: getErrorMessage(error, 'Failed to load homepage featured content.'),
      },
      {
        status: 500,
        headers,
      },
    )
  }
}

export async function PUT(req: NextRequest) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor'],
    })

    if (authResult.error) {
      return NextResponse.json(
        {
          message: authResult.error,
        },
        {
          status: authResult.status,
          headers,
        },
      )
    }

    const payload = await getPayload({ config })
    const body = await req.json().catch(() => null)
    const refs = normalizeHomepageFeaturedInput(body?.items)

    const validatedRefs = await validateHomepageFeaturedItems(payload, refs)

    await payload.updateGlobal({
      slug: 'homepage-featured-content',
      data: buildHomepageFeaturedGlobalData(validatedRefs),
      depth: 0,
      overrideAccess: true,
    })

    const selection = await getHomepageFeaturedSelection(payload)

    return NextResponse.json(selection, { headers })
  } catch (error) {
    return NextResponse.json(
      {
        message: getErrorMessage(error, 'Failed to save homepage featured content.'),
      },
      {
        status: 400,
        headers,
      },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
