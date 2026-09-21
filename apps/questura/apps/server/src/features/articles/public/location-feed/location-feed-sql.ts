/**
 * Ordered ids for one location's combined feed (articles + maps + itineraries).
 *
 * Params: $1 = exact location key, $2 = descendant prefix (`key|%`),
 * $3 = language, $4 = limit, $5 = offset.
 *
 * The route used to ask Payload for `page * pageSize` populated documents from
 * each of the three collections, merge them in memory and slice out one page:
 * page 100 of 50 fetched up to 15,000 populated documents to return 50, and a
 * crawler can ask for page 100 directly. Ordering is the only thing that needs
 * all three collections at once, and ordering needs nothing but
 * `published_at` and `id`, so it happens here. Only the ids that survive to
 * the requested page are hydrated into cards.
 *
 * Ordering is `published_at DESC NULLS LAST, type, id DESC`. The type and id
 * tie-breakers are what make the sequence total: without them two documents
 * published in the same second could swap places between page 1 and page 2 and
 * be shown twice or not at all.
 */
export const LOCATION_FEED_SQL = `
WITH feed AS (
  SELECT 'articles'::text AS type_key, a.id, a.published_at
  FROM articles a
  WHERE a.status::text = 'published'
    AND a.language::text = $3
    AND (a.location = $1 OR a.location LIKE $2)

  UNION ALL

  SELECT 'maps'::text AS type_key, m.id, m.published_at
  FROM single_type_listicles m
  WHERE m.status::text = 'published'
    AND m.language::text = $3
    AND (m.location = $1 OR m.location LIKE $2)

  UNION ALL

  SELECT 'itineraries'::text AS type_key, i.id, i.published_at
  FROM listicle_itineraries i
  WHERE i.status::text = 'published'
    AND i.language::text = $3
    AND (i.location = $1 OR i.location LIKE $2)
)
SELECT
  coalesce(
    json_agg(
      json_build_object('type', page_rows.type_key, 'id', page_rows.id)
      ORDER BY page_rows.published_at DESC NULLS LAST, page_rows.type_key ASC, page_rows.id DESC
    ),
    '[]'::json
  ) AS rows,
  (SELECT count(*) FROM feed) AS total_count
FROM (
  SELECT type_key, id, published_at
  FROM feed
  ORDER BY published_at DESC NULLS LAST, type_key ASC, id DESC
  LIMIT $4 OFFSET $5
) page_rows;
`
