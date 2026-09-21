/**
 * Ordered ids for one author's combined feed (articles + maps + itineraries).
 *
 * Params: $1 = author id, $2 = language, $3 = limit, $4 = offset.
 *
 * Same split as the location feed: order ids in SQL, hydrate one page. The
 * author route used to ask for up to 100 *fully populated* documents from each
 * of three collections at depth 2 with no `select`, so a prolific author cost
 * up to 300 hydrated documents — listicle bodies, venue relations and all — to
 * render summary cards that read eight fields.
 */
export const AUTHOR_FEED_SQL = `
WITH feed AS (
  SELECT 'articles'::text AS type_key, a.id, a.published_at
  FROM articles a
  WHERE a.status::text = 'published' AND a.language::text = $2 AND a.author_id = $1

  UNION ALL

  SELECT 'maps'::text AS type_key, m.id, m.published_at
  FROM single_type_listicles m
  WHERE m.status::text = 'published' AND m.language::text = $2 AND m.author_id = $1

  UNION ALL

  SELECT 'itineraries'::text AS type_key, i.id, i.published_at
  FROM listicle_itineraries i
  WHERE i.status::text = 'published' AND i.language::text = $2 AND i.author_id = $1
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
  LIMIT $3 OFFSET $4
) page_rows;
`
