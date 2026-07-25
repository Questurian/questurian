/**
 * Ranked full-text search across published articles, maps, and itineraries.
 *
 * Params: $1 = search query, $2 = language, $3 = limit, $4 = offset.
 *
 * Body text is assembled per collection from its block tables, then weighted
 * title (A) / meta (B) / body (C) so title matches outrank body matches.
 */
export const ARTICLE_SEARCH_SQL = `
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
