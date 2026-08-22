import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  formatPublicLocationHomepageDoc,
  getPublishedPageBlocks,
  resolveLocationGridScope,
  resolvePageBlocks,
  type LocationHomepageDoc,
} from '@/features/homepage-featured-content'

function message(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Failed to load neighborhood homepage.'
}

// Public neighborhood homepage: /country/city/neighborhood.
// Only an enabled, actually-published, non-empty page is routable.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ country: string; city: string; neighborhood: string }> },
) {
  try {
    const { country, city, neighborhood } = await params
    const payload = await getPayload({ config })
    const locationKey = `${country}|${city}|${neighborhood}`
    const locations = await payload.find({
      collection: 'locations',
      where: { locationKey: { equals: locationKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const location = locations.docs[0]
    if (!location) {
      return NextResponse.json({ message: 'Neighborhood not found.' }, { status: 404 })
    }

    const homepages = await payload.find({
      collection: 'location-homepages',
      where: {
        and: [
          { location: { equals: location.id } },
          { isEnabled: { equals: true } },
          { publishedRevision: { greater_than: 0 } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const homepage = homepages.docs[0] as LocationHomepageDoc | undefined
    const publishedBlocks = homepage ? getPublishedPageBlocks(homepage) : []
    if (!homepage || publishedBlocks.length === 0) {
      return NextResponse.json(
        { message: 'No enabled, published neighborhood homepage.' },
        { status: 404 },
      )
    }

    const scope = await resolveLocationGridScope(payload, homepage.location)
    const resolved = await resolvePageBlocks(payload, publishedBlocks, scope)
    return NextResponse.json({
      ...formatPublicLocationHomepageDoc(resolved, { country, city }),
      location: {
        id: location.id,
        locationKey: location.locationKey ?? locationKey,
        level: location.level ?? 'neighborhood',
        countryName: location.countryName ?? null,
        cityName: location.cityName ?? null,
        neighborhoodName: location.neighborhoodName ?? null,
      },
    })
  } catch (error) {
    return NextResponse.json({ message: message(error) }, { status: 500 })
  }
}
