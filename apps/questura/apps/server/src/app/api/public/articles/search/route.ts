import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import { ARTICLE_SEARCH_SQL } from '@/features/articles/public/search/search-sql'
import {
  INDEXED_ARTICLE_SEARCH_SQL,
  substringPattern,
} from '@/features/articles/public/search-index/query-sql'
import { searchIndexHasRows } from '@/features/articles/public/search-index/service'
import { MAX_QUERY_LENGTH, normalizeQuery } from '@/features/articles/public/search/params'
import { clampPageSize, resolvePagingWindow } from '@/features/articles/public/paging'
import { hydrateHits, parseHits, type QueryablePool } from '@/features/articles/public/search/hits'
import { noteOnRequest } from '@/shared/observability/request-report'
import { withPublicReadDiagnostics } from '@/shared/observability/public-read'
import { logger } from '@/shared/utils/logger'

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 })
}

type SearchRow = { rows: unknown; total_count: number | string }

// GET /api/public/articles/search?q=visa&page=1&pageSize=20&lang=en
//
// Reads the stored search documents. Search used to assemble its own corpus
// per query — body text aggregated out of a dozen block tables per collection
// and a weighted tsvector built for every published document — so its cost
// grew with the corpus for every visitor, including the ones who find nothing.
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

    const pageSize = clampPageSize(params.get('pageSize'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const window = resolvePagingWindow(params.get('page'), pageSize)
    if (!window.ok) return badRequest(window.message)
    const { page, offset } = window

    const payload = await getPayload({ config })

    return await withPublicReadDiagnostics(payload, req.headers, async () => {
      const pool = (payload.db as { pool?: QueryablePool }).pool
      if (!pool) throw new Error('Expected Payload db.pool to be available.')

      let source = 'index'
      let result = (await pool.query(INDEXED_ARTICLE_SEARCH_SQL, [
        q,
        lang,
        pageSize,
        offset,
        substringPattern(q),
      ])) as { rows: SearchRow[] }

      // An empty index and a corpus with no matches produce the same rows, and
      // one of those is a deployment whose backfill has not run. Checked only
      // when nothing matched, so an ordinary search never pays for it.
      if (Number(result.rows[0]?.total_count ?? 0) === 0 && !(await searchIndexHasRows(pool))) {
        logger.warn('Search index is empty; falling back to the corpus query', { q })
        source = 'fallback'
        result = (await pool.query(ARTICLE_SEARCH_SQL, [q, lang, pageSize, offset])) as {
          rows: SearchRow[]
        }
      }

      noteOnRequest('search', source)

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
    })
  } catch (error) {
    console.error('Error searching articles:', error)
    return NextResponse.json({ message: 'Search failed.' }, { status: 500 })
  }
}
