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
import { coalesce } from '@/shared/http/coalesce'
import { admitPublicWork, publicRead } from '@/shared/http/public-read'
import { noteOnRequest } from '@/shared/observability/request-report'

function message(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Failed to load neighborhood homepage.'
}

// Public neighborhood homepage: /country/city/neighborhood.
// Only an enabled, actually-published, non-empty page is routable.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ country: string; city: string; neighborhood: string }> },
) {
  try {
    const { country, city, neighborhood } = await params
    const payload = await getPayload({ config })
    const locationKey = `${country}|${city}|${neighborhood}`
    // Same treatment as the city page: rate limit, counting and cache headers
    // from publicRead; one assembly per page at a time (coalesced), admitted
    // through the assembly gate so joiners take no slot.
    return await publicRead({ req: request, scope: 'locationHomepage', payload }, async () => {
      const assemble = async (): Promise<{ status: number; body: unknown }> => {
        const locations = await payload.find({
          collection: 'locations',
          where: { locationKey: { equals: locationKey } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const location = locations.docs[0]
        if (!location) {
          return { status: 404, body: { message: 'Neighborhood not found.' } }
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
          return { status: 404, body: { message: 'No enabled, published neighborhood homepage.' } }
        }

        const scope = await resolveLocationGridScope(payload, homepage.location, location)
        const resolved = await resolvePageBlocks(payload, publishedBlocks, scope)
        return {
          status: 200,
          body: formatPublicLocationHomepageDoc(resolved, { country, city }, {
            ...location,
            locationKey: location.locationKey ?? locationKey,
            level: location.level ?? 'neighborhood',
          }),
        }
      }

      const { value, joined } = await coalesce(`location-homepage:${locationKey}`, () =>
        admitPublicWork('assembly', assemble, request.signal),
      )
      noteOnRequest('coalesced', joined ? 'joined' : 'ran')
      return NextResponse.json(value.body, { status: value.status })
    })
  } catch (error) {
    return NextResponse.json({ message: message(error) }, { status: 500 })
  }
}
