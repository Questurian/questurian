import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import type { LocationHomepageDoc } from '@/features/homepage-featured-content'
import { getErrorMessage } from '@/shared/utils/api-response'

function formatListItem(doc: LocationHomepageDoc) {
  const location = typeof doc.location === 'object' && doc.location !== null
    ? doc.location
    : null

  return {
    id: doc.id,
    isEnabled: doc.isEnabled ?? false,
    updatedAt: doc.updatedAt ?? null,
    location: location
      ? {
          id: location.id,
          locationKey: location.locationKey ?? null,
          level: location.level ?? null,
          countryName: location.countryName ?? null,
          cityName: location.cityName ?? null,
          neighborhoodName: location.neighborhoodName ?? null,
        }
      : null,
  }
}

// GET /api/location-homepages — list all location homepages
export async function GET(req: NextRequest) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor'],
    })

    if (authResult.error) {
      return NextResponse.json({ message: authResult.error }, { status: authResult.status, headers })
    }

    const payload = await getPayload({ config })
    const result = await payload.find({
      collection: 'location-homepages',
      depth: 1,
      limit: 500,
      sort: 'updatedAt',
      overrideAccess: true,
      select: {
        id: true,
        isEnabled: true,
        updatedAt: true,
        location: true,
      },
    })

    const items = (result.docs as LocationHomepageDoc[]).map(formatListItem)

    return NextResponse.json(items, { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to load location homepages.') },
      { status: 500, headers },
    )
  }
}

// POST /api/location-homepages — create a new location homepage
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
    const locationId = typeof body?.locationId === 'number' ? body.locationId : null

    if (!locationId) {
      return NextResponse.json(
        { message: 'locationId (number) is required.' },
        { status: 400, headers },
      )
    }

    const payload = await getPayload({ config })
    const doc = await payload.create({
      collection: 'location-homepages',
      data: {
        location: locationId,
        isEnabled: false,
        draftPageBlocks: [],
        publishedPageBlocks: [],
        publishedRevision: 0,
      },
      overrideAccess: true,
    }) as LocationHomepageDoc

    return NextResponse.json({ id: doc.id }, { status: 201, headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to create location homepage.') },
      { status: 400, headers },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
