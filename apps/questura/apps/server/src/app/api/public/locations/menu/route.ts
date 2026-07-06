import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import {
  buildPublicLocationMenu,
  type LocationMenuLocationDoc,
} from '@/features/location/public/menu'

export const dynamic = 'force-dynamic'

// GET /api/public/locations/menu
// Returns public country/city pages safe to link from nav.
export async function GET(req: NextRequest) {
  const headers = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })

    const [countries, cities] = await Promise.all([
      payload.find({
        collection: 'locations',
        where: { level: { equals: 'country' } },
        limit: 500,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'locations',
        where: { level: { equals: 'city' } },
        limit: 2000,
        depth: 0,
        overrideAccess: true,
      }),
    ])

    return NextResponse.json(
      buildPublicLocationMenu(
        countries.docs as LocationMenuLocationDoc[],
        cities.docs as LocationMenuLocationDoc[],
      ),
      { headers },
    )
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Failed to load location menu.'
    return NextResponse.json({ message }, { status: 500, headers })
  }
}

export function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
