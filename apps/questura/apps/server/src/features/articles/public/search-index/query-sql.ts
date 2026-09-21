/**
 * Ranked search over the stored search documents.
 *
 * Params: $1 = query text, $2 = language, $3 = limit, $4 = offset,
 * $5 = the substring pattern for $1 (built in `substringPattern`).
 *
 * The ranking is the one the corpus-rebuilding query used, unchanged — title
 * (A) over meta (B) over body (C), an exact-title bonus, a title-substring
 * bonus and a body-substring bonus. What changed is that the weighted vector
 * is read from a GIN-indexed column instead of being built for every published
 * document on every keystroke.
 *
 * The substring match is `LIKE` rather than `position(... ) > 0` because a
 * `LIKE` can use a trigram index and `position` cannot. The two are the same
 * test once the pattern's own wildcards are escaped, which is why the pattern
 * is built in TypeScript and passed as a parameter rather than assembled here.
 */
export const INDEXED_ARTICLE_SEARCH_SQL = `
WITH query AS (
  SELECT websearch_to_tsquery('english', $1) AS tsq, lower($1) AS raw
),
ranked AS (
  SELECT
    d.type_key,
    d.doc_id,
    d.published_at,
    (
      ts_rank_cd(d.document, query.tsq, 32) * 10
      + CASE WHEN lower(coalesce(d.title, '')) = query.raw THEN 4 ELSE 0 END
      + CASE WHEN position(query.raw IN lower(coalesce(d.title, ''))) > 0 THEN 2 ELSE 0 END
      + CASE WHEN d.phrase_text LIKE $5 ESCAPE '\\' THEN 1 ELSE 0 END
    ) AS rank
  FROM public_search_documents d
  CROSS JOIN query
  WHERE d.language = $2
    AND numnode(query.tsq) > 0
    AND (d.document @@ query.tsq OR d.phrase_text LIKE $5 ESCAPE '\\')
)
SELECT
  coalesce(
    json_agg(
      json_build_object('type', page_rows.type_key, 'id', page_rows.doc_id, 'rank', page_rows.rank)
      ORDER BY page_rows.rank DESC, page_rows.published_at DESC NULLS LAST, page_rows.doc_id DESC
    ),
    '[]'::json
  ) AS rows,
  (SELECT count(*) FROM ranked) AS total_count
FROM (
  SELECT type_key, doc_id, published_at, rank
  FROM ranked
  ORDER BY rank DESC, published_at DESC NULLS LAST, doc_id DESC
  LIMIT $3 OFFSET $4
) page_rows;
`

/**
 * The `LIKE` pattern for a substring search on `phrase_text`.
 *
 * `phrase_text` is stored lowercased, so the needle is lowercased to match.
 * The caller's own `%`, `_` and `\` are escaped: without that, a visitor
 * searching for `100%` would match every document, and `a_b` would match
 * `axb`. The old `position()` form had no such hazard, so this escaping is
 * new surface and is tested directly.
 */
export function substringPattern(query: string): string {
  return `%${query.toLowerCase().replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

/** Is the search index populated at all? One row is enough to know. */
export const SEARCH_INDEX_HAS_ROWS_SQL = 'SELECT 1 FROM public_search_documents LIMIT 1'
