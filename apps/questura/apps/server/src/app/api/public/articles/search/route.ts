import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import { ARTICLE_SEARCH_SQL } from '@/features/articles/public/search/search-sql'
import {
  MAX_QUERY_LENGTH,
  clampPage,
  clampPageSize,
  normalizeQuery,
} from '@/features/articles/public/search/params'
import {
  hydrateHits,
  parseHits,
  type QueryablePool,
} from '@/features/articles/public/search/hits'

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 })
}

// GET /api/public/articles/search?q=visa&page=1&pageSize=20&lang=en
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const q = normalizeQuery(params.get('q'))
    if (q.length < 2) return badRequest('q must be at least 2 characters')
    if (q.length > MAX_QUERY_LENGTH) {
      return badRequest(`q must be ${MAX_QUERY_LENGTH} characters or fewer`)
    }

    const lang = params.get('lang') ?? DEFAULT_LANG
    if (!isSupportedLang(lang)) return badRequest(`unsupported lang: ${lang}`)

    const page = clampPage(params.get('page'))
    const pageSize = clampPageSize(params.get('pageSize'))
    const offset = (page - 1) * pageSize

    const payload = await getPayload({ config })
    const pool = (payload.db as { pool?: QueryablePool }).pool
    if (!pool) throw new Error('Expected Payload db.pool to be available.')

    const result = await pool.query(ARTICLE_SEARCH_SQL, [q, lang, pageSize, offset])
    const firstRow = result.rows[0]
    const hits = parseHits(firstRow?.rows)
    const totalDocs = Number(firstRow?.total_count ?? 0)
    const totalPages = totalDocs === 0 ? 0 : Math.ceil(totalDocs / pageSize)
    const items = await hydrateHits(payload, hits)

    return NextResponse.json({
      q,
      page,
      pageSize,
      totalDocs,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1 && totalPages > 0,
      items,
    })
  } catch (error) {
    console.error('Error searching articles:', error)
    return NextResponse.json({ message: 'Search failed.' }, { status: 500 })
  }
}
