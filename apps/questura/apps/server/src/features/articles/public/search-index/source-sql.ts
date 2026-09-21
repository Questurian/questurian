/**
 * How one published document becomes one searchable row.
 *
 * This is the text assembly the search query used to do on every keystroke:
 * aggregate body text out of a dozen block tables per collection, concatenate
 * it with title and SEO fields, and build a weighted `tsvector`. The work is
 * unchanged — what changes is when it runs. It used to run per search, so its
 * cost grew with the whole corpus for every visitor. It now runs when a
 * document is saved, so it grows with editing instead.
 *
 * The weights are the ranking contract and must not drift: title (A) outranks
 * meta (B) outranks body (C). `phrase_text` is the lowercased concatenation
 * the substring match runs against.
 *
 * `$1` is the language filter and `$2` the document filter. Callers pass
 * `TRUE` for a full rebuild, or a predicate naming one document.
 */

const ARTICLE_BODY = `
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
`

const MAP_BODY = `
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
`

const ITINERARY_BODY = `
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
`

const DOCS = `
  SELECT
    'articles'::text AS type_key,
    a.id,
    a.language::text AS language,
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
  WHERE a.status::text = 'published'

  UNION ALL

  SELECT
    'maps'::text AS type_key,
    m.id,
    m.language::text AS language,
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
  WHERE m.status::text = 'published'

  UNION ALL

  SELECT
    'itineraries'::text AS type_key,
    i.id,
    i.language::text AS language,
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
  WHERE i.status::text = 'published'
`

/**
 * The CTE list every search-document query shares: body text per collection,
 * then the three collections unioned into one `docs` relation.
 */
const SEARCH_DOCUMENT_CTES = `
  article_body AS (${ARTICLE_BODY}),
  map_body AS (${MAP_BODY}),
  itinerary_body AS (${ITINERARY_BODY}),
  docs AS (${DOCS})
`

/**
 * The projection: one `public_search_documents` row per published document.
 *
 * `scope` is SQL written by this module, never by anything a visitor sends:
 * `TRUE` for a full rebuild, or a type/id predicate for one document.
 */
function searchDocumentRowsSelect(scope: string): string {
  return `
SELECT
  type_key,
  id AS doc_id,
  language,
  published_at,
  title,
  lower(concat_ws(' ', title_text, meta_text, body_text)) AS phrase_text,
  setweight(to_tsvector('english', coalesce(title_text, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(meta_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_text, '')), 'C') AS document
FROM docs
WHERE ${scope}
`
}

const INSERT_COLUMNS =
  'INSERT INTO public_search_documents (type_key, doc_id, language, published_at, title, phrase_text, document)'

/** Replace every row: the whole published corpus, rebuilt. */
export const REBUILD_SEARCH_INDEX_SQL = `
WITH ${SEARCH_DOCUMENT_CTES}
${INSERT_COLUMNS}
${searchDocumentRowsSelect('TRUE')}
`

/** Empty the table before a rebuild. Separate statement, same transaction. */
export const CLEAR_SEARCH_INDEX_SQL = 'DELETE FROM public_search_documents'

/**
 * Drop one document's row. Params: $1 = type key, $2 = document id.
 *
 * Runs unconditionally before the insert below, so an unpublished or deleted
 * document leaves search by the same path an edited one takes. One code path,
 * nothing to forget.
 */
export const DELETE_SEARCH_DOCUMENT_SQL =
  'DELETE FROM public_search_documents WHERE type_key = $1 AND doc_id = $2'

/**
 * Insert one document's row, if that document is currently published.
 *
 * Params: $1 = type key, $2 = document id. Inserts nothing when the document
 * is a draft, which is what makes the delete above sufficient.
 */
export const INSERT_SEARCH_DOCUMENT_SQL = `
WITH ${SEARCH_DOCUMENT_CTES}
${INSERT_COLUMNS}
${searchDocumentRowsSelect('type_key = $1 AND id = $2')}
`
