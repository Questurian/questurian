import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import {
  type LocationHomepageDoc,
  resolveLocationGridScopeFromLocation,
  searchLocationGridCandidates,
} from '@/features/homepage-featured-content'
import { getErrorMessage } from '@/shared/utils/api-response'

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }

  return Math.trunc(parsed)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor'],
    })

    if (authResult.error) {
      return NextResponse.json({ message: authResult.error }, { status: authResult.status, headers })
    }

    const { id } = await params
    const payload = await getPayload({ config })
    const doc = (await payload.findByID({
      collection: 'location-homepages',
      id,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const rawLocation =
      typeof doc.location === 'object' && doc.location !== null ? doc.location : null
    const scope = resolveLocationGridScopeFromLocation(rawLocation)

    if (!scope) {
      return NextResponse.json(
        {
          message: 'Location Grid blocks are only available on city homepages.',
        },
        { status: 400, headers },
      )
    }

    const { searchParams } = new URL(req.url)
    const response = await searchLocationGridCandidates(payload, {
      query: searchParams.get('q') || undefined,
      page: parsePositiveInt(searchParams.get('page')),
      limit: parsePositiveInt(searchParams.get('limit')),
      scope,
    })

    return NextResponse.json(response, { headers })
  } catch (error) {
    return NextResponse.json(
      {
        message: getErrorMessage(error, 'Failed to load location grid candidates.'),
      },
      {
        status: 500,
        headers,
      },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
