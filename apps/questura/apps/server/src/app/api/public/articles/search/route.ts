import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import {
  TYPE_TO_COLLECTION,
  type ArticleTypeKey,
} from '@/features/articles/public/scope'
import { serializeIndexItem, type IndexItem } from '@/features/articles/public/indexItem'

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20
const MAX_QUERY_LENGTH = 160
const ALL_TYPES: ArticleTypeKey[] = ['articles', 'maps', 'itineraries']

type ArticleSearchHit = {
  type: ArticleTypeKey
  id: number | string
  rank: number
}

type ArticleSearchItem = IndexItem & { type: ArticleTypeKey }

type SearchQueryResult = {
  rows: unknown
  total_count: number | string
}

type QueryablePool = {
  query: (sql: string, values: unknown[]) => Promise<{ rows: SearchQueryResult[] }>
}

const ARTICLE_SEARCH_SQL = `
WITH query AS (
  SELECT websearch_to_tsquery('english', $1) AS tsq, lower($1) AS raw
),
article_body AS (
  SELECT _parent_id AS id, string_agg(body, ' ') AS body
  FROM (
    SELECT _parent_id, content::text AS body
    FROM articles_blocks_text
    UNION ALL
    SELECT _parent_id, concat_ws(' ', alt_text, caption) AS body
    FROM articles_blocks_image
    UNION ALL
    SELECT _parent_id, caption AS body
    FROM articles_blocks_img_pair
    UNION ALL
    SELECT _parent_id, caption AS body
    FROM articles_blocks_img_trio
    UNION ALL
    SELECT _parent_id, concat_ws(' ', label, text) AS body
    FROM articles_blocks_in_the_know
    UNION ALL
    SELECT _parent_id, concat_ws(' ', label, text) AS body
    FROM articles_blocks_highlight_callout
    UNION ALL
    SELECT _parent_id, quote AS body
    FROM articles_blocks_pull_quote
    UNION ALL
    SELECT parent._parent_id, item.text AS body
    FROM articles_blocks_key_takeaway parent
    JOIN articles_blocks_key_takeaway_items item ON item._parent_id = parent.id
    UNION ALL
    SELECT parent._parent_id, concat_ws(' ', item.question, item.answer) AS body
    FROM articles_blocks_faq parent
    JOIN articles_blocks_faq_items item ON item._parent_id = parent.id
  ) body_rows
  WHERE body IS NOT NULL AND body <> ''
  GROUP BY _parent_id
),
map_body AS (
  SELECT _parent_id AS id, string_agg(body, ' ') AS body
  FROM (
    SELECT _parent_id, concat_ws(' ', blurb::text, block_name) AS body
    FROM single_type_listicles_blocks_data_accommodations
    UNION ALL
    SELECT _parent_id, concat_ws(' ', blurb::text, block_name) AS body
    FROM single_type_listicles_blocks_data_attractions
    UNION ALL
    SELECT _parent_id, concat_ws(' ', blurb::text, block_name) AS body
    FROM single_type_listicles_blocks_data_dining
    UNION ALL
    SELECT _parent_id, concat_ws(' ', blurb::text, block_name) AS body
    FROM single_type_listicles_blocks_data_nightlife
  ) body_rows
  WHERE body IS NOT NULL AND body <> ''
  GROUP BY _parent_id
),
itinerary_body AS (
  SELECT _parent_id AS id, string_agg(body, ' ') AS body
  FROM (
    SELECT _parent_id, concat_ws(' ', blurb::text, selection_reason, block_name) AS body
    FROM listicle_itineraries_blocks_itinerary_accommodations
    UNION ALL
    SELECT _parent_id, concat_ws(' ', blurb::text, selection_reason, block_name) AS body
    FROM listicle_itineraries_blocks_itinerary_attractions
    UNION ALL
    SELECT _parent_id, concat_ws(' ', blurb::text, selection_reason, block_name) AS body
    FROM listicle_itineraries_blocks_itinerary_dining
    UNION ALL
    SELECT _parent_id, concat_ws(' ', blurb::text, block_name) AS body
    FROM listicle_itineraries_blocks_itinerary_key_location
    UNION ALL
    SELECT _parent_id, concat_ws(' ', blurb::text, selection_reason, block_name) AS body
    FROM listicle_itineraries_blocks_itinerary_nightlife
    UNION ALL
    SELECT _parent_id, concat_ws(' ', blurb::text, selection_reason, block_name) AS body
    FROM listicle_itineraries_blocks_itinerary_where_staying
  ) body_rows
  WHERE body IS NOT NULL AND body <> ''
  GROUP BY _parent_id
),
docs AS (
  SELECT
    'articles'::text AS article_type_key,
    a.id,
    a.published_at,
    a.title,
    concat_ws(' ', a.title, a.slug, a.seo_section_seo_title) AS title_text,
    concat_ws(
      ' ',
      a.seo_section_meta_description,
      a.seo_section_open_graph_title,
      a.seo_section_open_graph_description,
      a.seo_section_twitter_card_title,
      a.seo_section_twitter_card_description
    ) AS meta_text,
    coalesce(article_body.body, '') AS body_text
  FROM articles a
  LEFT JOIN article_body ON article_body.id = a.id
  WHERE a.status::text = 'published' AND a.language::text = $2

  UNION ALL

  SELECT
    'maps'::text AS article_type_key,
    m.id,
    m.published_at,
    m.title,
    concat_ws(' ', m.title, m.slug, m.listicle_type, m.seo_section_seo_title) AS title_text,
    concat_ws(
      ' ',
      m.header_intro,
      m.list_tone,
      m.seo_section_meta_description,
      m.seo_section_open_graph_title,
      m.seo_section_open_graph_description,
      m.seo_section_twitter_card_title,
      m.seo_section_twitter_card_description
    ) AS meta_text,
    coalesce(map_body.body, '') AS body_text
  FROM single_type_listicles m
  LEFT JOIN map_body ON map_body.id = m.id
  WHERE m.status::text = 'published' AND m.language::text = $2

  UNION ALL

  SELECT
    'itineraries'::text AS article_type_key,
    i.id,
    i.published_at,
    i.title,
    concat_ws(' ', i.title, i.slug, i.seo_section_seo_title) AS title_text,
    concat_ws(
      ' ',
      i.header_intro,
      i.list_tone,
      i.generation_brief,
      i.plan_overview,
      i.seo_section_meta_description,
      i.seo_section_open_graph_title,
      i.seo_section_open_graph_description,
      i.seo_section_twitter_card_title,
      i.seo_section_twitter_card_description
    ) AS meta_text,
    coalesce(itinerary_body.body, '') AS body_text
  FROM listicle_itineraries i
  LEFT JOIN itinerary_body ON itinerary_body.id = i.id
  WHERE i.status::text = 'published' AND i.language::text = $2
),
vectors AS (
  SELECT
    article_type_key,
    id,
    published_at,
    title,
    lower(concat_ws(' ', title_text, meta_text, body_text)) AS phrase_text,
    setweight(to_tsvector('english', coalesce(title_text, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(meta_text, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(body_text, '')), 'C') AS document
  FROM docs
),
ranked AS (
  SELECT
    vectors.article_type_key,
    vectors.id,
    vectors.published_at,
    (
      ts_rank_cd(vectors.document, query.tsq, 32) * 10
      + CASE WHEN lower(coalesce(vectors.title, '')) = query.raw THEN 4 ELSE 0 END
      + CASE WHEN position(query.raw IN lower(coalesce(vectors.title, ''))) > 0 THEN 2 ELSE 0 END
      + CASE WHEN position(query.raw IN vectors.phrase_text) > 0 THEN 1 ELSE 0 END
    ) AS rank
  FROM vectors
  CROSS JOIN query
  WHERE numnode(query.tsq) > 0
    AND (vectors.document @@ query.tsq OR position(query.raw IN vectors.phrase_text) > 0)
)
SELECT
  coalesce(
    json_agg(
      json_build_object('type', article_type_key, 'id', id, 'rank', rank)
      ORDER BY rank DESC, published_at DESC NULLS LAST, id DESC
    ),
    '[]'::json
  ) AS rows,
  (SELECT count(*) FROM ranked) AS total_count
FROM (
  SELECT article_type_key, id, rank, published_at
  FROM ranked
  ORDER BY rank DESC, published_at DESC NULLS LAST, id DESC
  LIMIT $3 OFFSET $4
) page_rows;
`

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 })
}

function normalizeQuery(raw: string | null): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ')
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

function parseHits(value: unknown): ArticleSearchHit[] {
  const rows = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(rows)) return []

  return rows.flatMap((row): ArticleSearchHit[] => {
    if (!row || typeof row !== 'object') return []
    const hit = row as Record<string, unknown>
    if (!ALL_TYPES.includes(hit.type as ArticleTypeKey)) return []
    if (typeof hit.id !== 'number' && typeof hit.id !== 'string') return []

    return [{
      type: hit.type as ArticleTypeKey,
      id: hit.id,
      rank: Number(hit.rank) || 0,
    }]
  })
}

async function hydrateHits(payload: Awaited<ReturnType<typeof getPayload>>, hits: ArticleSearchHit[]) {
  const itemsByKey = new Map<string, ArticleSearchItem>()

  await Promise.all(
    ALL_TYPES.map(async (type) => {
      const ids = hits.filter((hit) => hit.type === type).map((hit) => hit.id)
      if (ids.length === 0) return

      const result = await payload.find({
        collection: TYPE_TO_COLLECTION[type],
        where: { id: { in: ids } },
        limit: ids.length,
        depth: 1,
        overrideAccess: true,
      })

      for (const doc of result.docs) {
        const id = (doc as unknown as Record<string, unknown>).id
        itemsByKey.set(`${type}:${String(id)}`, {
          ...serializeIndexItem(doc, type),
          type,
        })
      }
    }),
  )

  return hits
    .map((hit) => itemsByKey.get(`${hit.type}:${String(hit.id)}`))
    .filter((item): item is ArticleSearchItem => Boolean(item))
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
