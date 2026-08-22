import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { Where } from 'payload'

import config from '@/payload.config'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import {
  TYPE_TO_COLLECTION,
  type ArticleTypeKey,
} from '@/features/articles/public/scope'
import {
  INDEX_ITEM_DEPTH,
  INDEX_ITEM_SELECT,
  serializeIndexItem,
  type IndexItem,
} from '@/features/articles/public/indexItem'

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20
const LOCATION_KEY_PATTERN = /^[a-z0-9-]+(\|[a-z0-9-]+){0,2}$/

const ALL_TYPES: ArticleTypeKey[] = ['articles', 'maps', 'itineraries']

type TypedItem = IndexItem & { type: ArticleTypeKey }

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 })
}

function clampPageSize(raw: string | null): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1) return DEFAULT_PAGE_SIZE
  return Math.min(Math.floor(value), MAX_PAGE_SIZE)
}

function clampPage(raw: string | null): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.floor(value)
}

function publishedAtValue(item: IndexItem): number {
  if (!item.publishedAt) return 0
  const time = new Date(item.publishedAt).getTime()
  return Number.isNaN(time) ? 0 : time
}

// GET /api/public/articles/by-location?key=peru|lima&page=1&pageSize=20&lang=en
//
// Flat, date-sorted list of all published content (articles + maps +
// itineraries) attached to a location key or any of its descendants.
// Works for any location, whether or not it has a homepage.
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams

    const key = (params.get('key') ?? '').trim().toLowerCase()
    if (!LOCATION_KEY_PATTERN.test(key)) {
      return badRequest('key must be a location key like "peru" or "peru|lima"')
    }

    const lang = params.get('lang') ?? DEFAULT_LANG
    if (!isSupportedLang(lang)) return badRequest(`unsupported lang: ${lang}`)

    const page = clampPage(params.get('page'))
    const pageSize = clampPageSize(params.get('pageSize'))

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

    const where: Where = {
      and: [
        { status: { equals: 'published' } },
        { language: { equals: lang } },
        {
          or: [
            { location: { equals: key } },
            { location: { like: `${key}|%` } },
          ],
        },
      ],
    }

    // Merge the three collections in memory: fetch enough docs from each to
    // cover the requested page, then sort and slice the combined list.
    const fetchLimit = page * pageSize
    const results = await Promise.all(
      ALL_TYPES.map((type) =>
        payload.find({
          collection: TYPE_TO_COLLECTION[type],
          where,
          limit: fetchLimit,
          depth: INDEX_ITEM_DEPTH,
          select: INDEX_ITEM_SELECT,
          sort: '-publishedAt',
          overrideAccess: true,
        }),
      ),
    )

    const merged: TypedItem[] = results.flatMap((result, index) =>
      result.docs.map((doc) => ({
        ...serializeIndexItem(doc, ALL_TYPES[index]),
        type: ALL_TYPES[index],
      })),
    )
    merged.sort((a, b) => publishedAtValue(b) - publishedAtValue(a))

    const totalDocs = results.reduce((sum, result) => sum + result.totalDocs, 0)
    const totalPages = Math.max(1, Math.ceil(totalDocs / pageSize))
    const items = merged.slice((page - 1) * pageSize, page * pageSize)

    const countryName = location.countryName || location.country
    const label =
      location.level === 'country'
        ? countryName
        : location.level === 'city'
          ? `${location.cityName || location.city}, ${countryName}`
          : `${location.neighborhoodName || location.neighborhood}, ${location.cityName || location.city}, ${countryName}`

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
