import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  getPublishedPageBlocks,
  type LocationHomepageDoc,
  formatPublicLocationHomepageDoc,
  resolveLocationGridScope,
  resolvePageBlocksWithReadStats,
} from '@/features/homepage-featured-content'
import { readBudgetOverrideFromHeaders } from '@/features/homepage-featured-content/reference-grid/page-read-budget'
import { noteOnRequest } from '@/shared/observability/request-report'
import { withPublicReadDiagnostics } from '@/shared/observability/public-read'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

// GET /api/public/location-homepages/[country]/[city]
// No auth required — public data for SSR/SEO rendering
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ country: string; city: string }> },
) {
  try {
    const { country, city } = await params
    const locationKey = `${country}|${city}`
    const payload = await getPayload({ config })

    return await withPublicReadDiagnostics(payload, req.headers, async () => {
      // Step 1: resolve location by locationKey
      const locationResult = await payload.find({
        collection: 'locations',
        where: { locationKey: { equals: locationKey } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      if (locationResult.totalDocs === 0) {
        return NextResponse.json({ message: 'Location not found.' }, { status: 404 })
      }

      const location = locationResult.docs[0]

      // Step 2: find the enabled homepage for that location
      const homepageResult = await payload.find({
        collection: 'location-homepages',
        where: {
          and: [{ location: { equals: location.id } }, { isEnabled: { equals: true } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      if (homepageResult.totalDocs === 0) {
        return NextResponse.json(
          { message: 'No enabled homepage for this location.' },
          { status: 404 },
        )
      }

      const doc = homepageResult.docs[0] as LocationHomepageDoc
      const locationGridScope = await resolveLocationGridScope(payload, doc.location, location)
      const { blocks: resolvedBlocks, stats } = await resolvePageBlocksWithReadStats(
        payload,
        getPublishedPageBlocks(doc),
        locationGridScope,
        readBudgetOverrideFromHeaders(req.headers),
      )

      noteOnRequest('reads', stats.reads)
      noteOnRequest('deduped', stats.deduped)
      noteOnRequest('peak', `${stats.peakConcurrency}/${stats.limit}`)

      return NextResponse.json(
        formatPublicLocationHomepageDoc(resolvedBlocks, { country, city }, location),
      )
    })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to load location homepage.') },
      { status: 500 },
    )
  }
}
