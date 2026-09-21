import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import {
  hydrateArticleRefs,
  parseArticleRefs,
  type QueryablePool,
} from '@/features/articles/public/hydrate-refs'
import { LOCATION_FEED_SQL } from '@/features/articles/public/location-feed/location-feed-sql'
import { clampPageSize, resolvePagingWindow } from '@/features/articles/public/paging'
import { publicLocationLabel } from '@/shared/location/server/publicLocationLabel'

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20
const LOCATION_KEY_PATTERN = /^[a-z0-9-]+(\|[a-z0-9-]+){0,2}$/

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 })
}

// GET /api/public/articles/by-location?key=peru|lima&page=1&pageSize=20&lang=en
//
// Flat, date-sorted list of all published content (articles + maps +
// itineraries) attached to a location key or any of its descendants.
// Works for any location, whether or not it has a homepage.
//
// Ordering happens in SQL over ids; only the requested page is hydrated into
// cards. See `location-feed-sql.ts` for why the in-memory merge went away.
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams

    const key = (params.get('key') ?? '').trim().toLowerCase()
    if (!LOCATION_KEY_PATTERN.test(key)) {
      return badRequest('key must be a location key like "peru" or "peru|lima"')
    }

    const lang = params.get('lang') ?? DEFAULT_LANG
    if (!isSupportedLang(lang)) return badRequest(`unsupported lang: ${lang}`)

    const pageSize = clampPageSize(params.get('pageSize'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const window = resolvePagingWindow(params.get('page'), pageSize)
    if (!window.ok) return badRequest(window.message)
    const { page, offset } = window

    const payload = await getPayload({ config })

    const locationResult = await payload.find({
      collection: 'locations',
      where: { locationKey: { equals: key } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const location = locationResult.docs[0]
    if (!location) {
      return NextResponse.json({ message: 'Unknown location.' }, { status: 404 })
    }

    const pool = (payload.db as { pool?: QueryablePool }).pool
    if (!pool) throw new Error('Expected Payload db.pool to be available.')

    // `key` is validated against LOCATION_KEY_PATTERN above, so it carries no
    // LIKE wildcard; the prefix is still passed as a parameter, not inlined.
    const result = await pool.query(LOCATION_FEED_SQL, [key, `${key}|%`, lang, pageSize, offset])
    const firstRow = result.rows[0]
    const refs = parseArticleRefs(firstRow?.rows)
    const totalDocs = Number(firstRow?.total_count ?? 0)
    const totalPages = Math.max(1, Math.ceil(totalDocs / pageSize))

    const items = await hydrateArticleRefs(payload, refs)

    const label = publicLocationLabel(location)

    return NextResponse.json({
      location: {
        locationKey: key,
        level: location.level,
        label,
      },
      page,
      pageSize,
      totalDocs,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      items,
    })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Failed to load content.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
