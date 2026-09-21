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
import {
  readBudgetOverrideFromHeaders,
  type PageReadStats,
} from '@/features/homepage-featured-content/reference-grid/page-read-budget'
import { noteOnRequest } from '@/shared/observability/request-report'
import { admitPublicWork, publicRead } from '@/shared/http/public-read'
import { coalesce } from '@/shared/http/coalesce'

/**
 * One page assembly's outcome, separated from the `NextResponse` that carries
 * it: a Response body can be read once, so callers that join in-flight work
 * have to each build their own response around one shared result.
 */
type PageResult = {
  status: number
  body: unknown
  stats?: PageReadStats
}

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

    return await publicRead({ req, scope: 'locationHomepage', payload }, async () => {
      // Assembling this page is the most expensive read in the app, and the
      // moments it is asked for several times at once -- a cold cache after a
      // publish, a crawler on several connections -- are the moments the
      // server can least afford to do it several times. The A/B read-limit
      // header opts out so a measurement is never confounded by a join --
      // but only where the override itself is honoured. Checking the raw
      // header let any caller in production skip coalescing and force one
      // full assembly per request.
      const coalesceKey = `location-homepage:${locationKey}`
      const readBudget = readBudgetOverrideFromHeaders(req.headers)
      const skipCoalescing = readBudget.limit !== undefined || readBudget.disabled === true

      const assemble = async (): Promise<PageResult> => {
        // Step 1: resolve location by locationKey
        const locationResult = await payload.find({
          collection: 'locations',
          where: { locationKey: { equals: locationKey } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })

        if (locationResult.totalDocs === 0) {
          return { status: 404, body: { message: 'Location not found.' } }
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
          return { status: 404, body: { message: 'No enabled homepage for this location.' } }
        }

        const doc = homepageResult.docs[0] as LocationHomepageDoc
        const locationGridScope = await resolveLocationGridScope(payload, doc.location, location)
        const { blocks: resolvedBlocks, stats } = await resolvePageBlocksWithReadStats(
          payload,
          getPublishedPageBlocks(doc),
          locationGridScope,
          readBudget,
        )

        return {
          status: 200,
          body: formatPublicLocationHomepageDoc(resolvedBlocks, { country, city }, location),
          stats,
        }
      }

      // The admission gate wraps the shared work, not each request: readers
      // who join an assembly already in flight cost nothing and take no slot.
      const admitted = () => admitPublicWork('assembly', assemble, req.signal)

      const { value, joined } = skipCoalescing
        ? { value: await admitted(), joined: false }
        : await coalesce(coalesceKey, admitted)

      if (value.stats) {
        noteOnRequest('reads', value.stats.reads)
        noteOnRequest('deduped', value.stats.deduped)
        noteOnRequest('batches', value.stats.batches)
        noteOnRequest('prefetched', value.stats.prefetched)
        noteOnRequest('peak', `${value.stats.peakConcurrency}/${value.stats.limit}`)
      }
      noteOnRequest('coalesced', joined ? 'joined' : 'ran')

      return NextResponse.json(value.body, { status: value.status })
    })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to load location homepage.') },
      { status: 500 },
    )
  }
}
