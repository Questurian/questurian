/**
 * A synthetic corpus, big enough to find a bottleneck rather than a
 * regression.
 *
 *   pnpm readiness:corpus -- build medium
 *   pnpm readiness:corpus -- author 5000
 *   pnpm readiness:corpus -- clear
 *
 * Every measurement in this series so far ran against the development copy:
 * 31 locations and 25 articles. That is a fine regression baseline — if a
 * query that took 8ms takes 400ms tomorrow, this corpus says so. It cannot
 * find a bottleneck, because nothing in it is large enough to have one. A
 * page that fans out over a city's articles behaves identically at 25
 * articles whether it is O(n) or O(n²).
 *
 * So this builds corpora whose *shape* is the thing under test:
 *
 *  - `small`   — the development corpus's size, as a control.
 *  - `medium`  — enough cities that no single one dominates, and enough
 *                articles per city that an index page is a real page.
 *  - `large`   — many distinct heavy cities, which is the shape the plan
 *                asks for: the failure mode being hunted is a per-city cost
 *                that is invisible when one city holds everything.
 *
 * Determinism is the point, not realism. Every value is derived from the row
 * index and the seed, so two runs of `build large` produce byte-identical
 * rows and a measurement can be compared against one taken last week. There
 * is no randomness at all — a seeded PRNG would also be reproducible, but
 * deriving from the index means a single row can be reasoned about without
 * replaying the generator.
 *
 * The rows are *marked*. Everything this writes lives under one country slug
 * and one author, so `clear` is an exact inverse rather than a guess, and a
 * corpus can never be confused with the real 25 articles it sits beside.
 * Preflight still refuses any database that is not disposable, so the worst
 * case is a mess in a database that exists to be dropped.
 */

import { Pool } from 'pg'

import { sandboxDatabaseUri } from './database'

/**
 * The marker. One country slug owns every synthetic location, and every
 * synthetic article's `location` therefore starts with it — which is what
 * makes `clear` a single predicate rather than a list of ids to remember.
 */
export const CORPUS_COUNTRY = 'zz-readiness'
export const CORPUS_AUTHOR = 'Readiness Synthetic Author'

export type CorpusSize = 'small' | 'medium' | 'large'

export type CorpusShape = {
  /** Distinct cities. The plan's "many distinct heavy cities". */
  cities: number
  /** Neighbourhoods per city. */
  neighborhoodsPerCity: number
  /** Published articles per city. */
  articlesPerCity: number
  /** A fraction of articles are drafts, so published-only filters are exercised. */
  draftsPerCity: number
  /** A fraction are members-only, so the access filter has something to do. */
  memberArticlesPerCity: number
}

/**
 * Sizes, and why each number is what it is.
 *
 * `medium` is the size at which a city index page stops being one screen:
 * 40 published articles is several pages of any list. `large` multiplies the
 * *number of cities* rather than the articles inside one, because a cost that
 * is per-city is exactly the cost the 25-article corpus hides — one city with
 * 5,000 articles and 200 cities with 25 each are the same row count and very
 * different systems.
 */
export const CORPUS_SIZES: Record<CorpusSize, CorpusShape> = {
  small: { cities: 6, neighborhoodsPerCity: 2, articlesPerCity: 4, draftsPerCity: 1, memberArticlesPerCity: 1 },
  medium: { cities: 40, neighborhoodsPerCity: 3, articlesPerCity: 40, draftsPerCity: 6, memberArticlesPerCity: 8 },
  large: { cities: 200, neighborhoodsPerCity: 4, articlesPerCity: 40, draftsPerCity: 6, memberArticlesPerCity: 8 },
}

export type CorpusCounts = { locations: number; articles: number; published: number; member: number }

/** A stable four-digit label, so ordering by slug matches ordering by index. */
const pad = (value: number, width = 4): string => String(value).padStart(width, '0')

const cityName = (index: number): string => `city-${pad(index)}`
const neighborhoodName = (city: number, index: number): string => `n-${pad(city)}-${pad(index, 2)}`

/**
 * One author owns the whole corpus.
 *
 * That is not incidental. L03's question — what a fan-out costs when one
 * person's career is large — needs a single author with thousands of
 * published articles, and building a second "realistic" author distribution
 * alongside it would mean the corpus answers neither question cleanly.
 */
export async function ensureCorpusAuthor(pool: Pool): Promise<number> {
  const existing = await pool.query<{ id: number }>(`SELECT id FROM authors WHERE display_name = $1 LIMIT 1`, [
    CORPUS_AUTHOR,
  ])
  if (existing.rows[0]) return existing.rows[0].id

  const created = await pool.query<{ id: number }>(
    `INSERT INTO authors (display_name, updated_at, created_at) VALUES ($1, now(), now()) RETURNING id`,
    [CORPUS_AUTHOR],
  )
  return created.rows[0]!.id
}

/**
 * Remove everything the generator owns.
 *
 * Articles first: `location` carries the country slug, so they are removable
 * without joining to the rows about to be deleted. The author goes last, and
 * only if nothing else references it — a real article that somehow acquired
 * the synthetic author should block the delete rather than cascade into one.
 */
export async function clearCorpus(pool: Pool): Promise<CorpusCounts> {
  const articles = await pool.query(`DELETE FROM articles WHERE location LIKE $1`, [`${CORPUS_COUNTRY}%`])
  const locations = await pool.query(`DELETE FROM locations WHERE country = $1`, [CORPUS_COUNTRY])
  await pool.query(
    `DELETE FROM authors WHERE display_name = $1 AND NOT EXISTS (SELECT 1 FROM articles WHERE articles.author_id = authors.id)`,
    [CORPUS_AUTHOR],
  )

  return { locations: locations.rowCount ?? 0, articles: articles.rowCount ?? 0, published: 0, member: 0 }
}

/**
 * Build the corpus.
 *
 * Rows go in with `generate_series` and one statement per city rather than
 * one statement per row: 200 cities × 54 articles is 10,800 inserts, and at
 * a round trip each that is minutes of nothing. The set-returning form keeps
 * a `large` build to a few seconds, which matters because a corpus nobody
 * waits for is a corpus that gets skipped.
 */
export async function buildCorpus(pool: Pool, size: CorpusSize, seed: number): Promise<CorpusCounts> {
  const shape = CORPUS_SIZES[size]
  await clearCorpus(pool)
  const authorId = await ensureCorpusAuthor(pool)

  await pool.query(
    `INSERT INTO locations (country, city, neighborhood, location_key, level, parent_key, country_name, city_name, neighborhood_name, updated_at, created_at)
     VALUES ($1, NULL, NULL, $1, 'country', NULL, 'Readiness Country', NULL, NULL, now(), now())`,
    [CORPUS_COUNTRY],
  )

  let locations = 1
  let articles = 0
  let published = 0
  let member = 0

  const perCity = shape.articlesPerCity + shape.draftsPerCity

  for (let cityIndex = 0; cityIndex < shape.cities; cityIndex += 1) {
    const city = cityName(cityIndex)
    const cityKey = `${CORPUS_COUNTRY}|${city}`

    await pool.query(
      `INSERT INTO locations (country, city, neighborhood, location_key, level, parent_key, country_name, city_name, neighborhood_name, updated_at, created_at)
       VALUES ($1, $2, NULL, $3, 'city', $1, 'Readiness Country', $4, NULL, now(), now())`,
      [CORPUS_COUNTRY, city, cityKey, `City ${pad(cityIndex)}`],
    )
    locations += 1

    for (let n = 0; n < shape.neighborhoodsPerCity; n += 1) {
      const neighborhood = neighborhoodName(cityIndex, n)
      await pool.query(
        `INSERT INTO locations (country, city, neighborhood, location_key, level, parent_key, country_name, city_name, neighborhood_name, updated_at, created_at)
         VALUES ($1, $2, $3, $4, 'neighborhood', $5, 'Readiness Country', $6, $7, now(), now())`,
        [
          CORPUS_COUNTRY,
          city,
          neighborhood,
          `${cityKey}|${neighborhood}`,
          cityKey,
          `City ${pad(cityIndex)}`,
          `Neighborhood ${neighborhood}`,
        ],
      )
      locations += 1
    }

    // One statement, `perCity` rows. `i` is the within-city index; `g` is the
    // global one, which is what every derived value uses so that two cities
    // never produce the same slug.
    const base = cityIndex * perCity
    await pool.query(
      `INSERT INTO articles (title, slug, author_id, status, location, canonical_path, access, language, published_at, updated_at, created_at)
       SELECT
         $4 || ' ' || lpad((($1::int + i))::text, 6, '0') || ' ' || repeat('w ', 4 + ((($1::int + i) * 7 + $7::int) % 9)),
         'zz-readiness-a' || lpad((($1::int + i))::text, 6, '0'),
         $2::int,
         CASE WHEN i < $5::int THEN 'published'::enum_articles_status ELSE 'draft'::enum_articles_status END,
         $3::text,
         '/' || $8::text || '/articles/zz-readiness-a' || lpad((($1::int + i))::text, 6, '0'),
         CASE WHEN i < $6::int THEN 'member'::enum_articles_access ELSE 'free'::enum_articles_access END,
         'en'::enum_articles_language,
         now(), now(), now()
       FROM generate_series(0, $9::int - 1) AS i`,
      [
        base,
        authorId,
        cityKey,
        'Readiness',
        shape.articlesPerCity,
        shape.memberArticlesPerCity,
        seed,
        `${CORPUS_COUNTRY}/${city}`,
        perCity,
      ],
    )

    articles += perCity
    published += shape.articlesPerCity
    member += Math.min(shape.memberArticlesPerCity, shape.articlesPerCity)
  }

  return { locations, articles, published, member }
}

/**
 * A single author with `count` published articles, and nothing else.
 *
 * L03 asks what target discovery costs against a career-sized corpus. That is
 * a different question from "a big site", and mixing them would mean a memory
 * number that includes 800 locations nobody asked about. The articles all sit
 * in one city, because the fan-out walks the author's articles and does not
 * care how they are distributed.
 */
export async function buildAuthorCorpus(pool: Pool, count: number, seed: number): Promise<{ authorId: number }> {
  await clearCorpus(pool)
  const authorId = await ensureCorpusAuthor(pool)
  const city = cityName(0)
  const cityKey = `${CORPUS_COUNTRY}|${city}`

  await pool.query(
    `INSERT INTO locations (country, city, neighborhood, location_key, level, parent_key, country_name, city_name, neighborhood_name, updated_at, created_at)
     VALUES ($1, NULL, NULL, $1, 'country', NULL, 'Readiness Country', NULL, NULL, now(), now()),
            ($1, $2, NULL, $3, 'city', $1, 'Readiness Country', 'City 0000', NULL, now(), now())`,
    [CORPUS_COUNTRY, city, cityKey],
  )

  // Chunked so one statement does not build a 5,000-row result set in memory
  // on the server side while the client waits.
  const CHUNK = 1_000
  for (let start = 0; start < count; start += CHUNK) {
    const rows = Math.min(CHUNK, count - start)
    await pool.query(
      `INSERT INTO articles (title, slug, author_id, status, location, canonical_path, access, language, published_at, updated_at, created_at)
       SELECT
         'Readiness ' || lpad((($1::int + i))::text, 6, '0') || ' ' || repeat('w ', 4 + ((($1::int + i) * 7 + $5::int) % 9)),
         'zz-readiness-a' || lpad((($1::int + i))::text, 6, '0'),
         $2::int,
         'published'::enum_articles_status,
         $3::text,
         '/' || $4::text || '/articles/zz-readiness-a' || lpad((($1::int + i))::text, 6, '0'),
         'free'::enum_articles_access,
         'en'::enum_articles_language,
         now(), now(), now()
       FROM generate_series(0, $6::int - 1) AS i`,
      [start, authorId, cityKey, `${CORPUS_COUNTRY}/${city}`, seed, rows],
    )
  }

  return { authorId }
}

async function main(): Promise<void> {
  // `pnpm readiness:corpus -- build large` puts a bare `--` in argv; dropping
  // it means the script reads the same either way.
  const argv = process.argv.slice(2).filter((entry) => entry !== '--')
  const command = argv[0] ?? 'status'
  const seed = Number(process.env.READINESS_SEED ?? 20260922)
  const pool = new Pool({ connectionString: sandboxDatabaseUri(), max: 2 })

  try {
    if (command === 'build') {
      const size = (argv[1] ?? 'medium') as CorpusSize
      if (!CORPUS_SIZES[size]) throw new Error(`Unknown size "${size}". Use small, medium or large.`)
      const started = Date.now()
      const counts = await buildCorpus(pool, size, seed)
      console.log(
        `Built the ${size} corpus in ${Date.now() - started}ms: ` +
          `${counts.locations} locations, ${counts.articles} articles ` +
          `(${counts.published} published, ${counts.member} members-only) under "${CORPUS_COUNTRY}".`,
      )
      return
    }

    if (command === 'author') {
      const count = Number(argv[1] ?? 5000)
      if (!Number.isFinite(count) || count < 1) throw new Error('Usage: corpus author <count>')
      const started = Date.now()
      const { authorId } = await buildAuthorCorpus(pool, count, seed)
      console.log(`Built one author (id ${authorId}) with ${count} published articles in ${Date.now() - started}ms.`)
      return
    }

    if (command === 'clear') {
      const removed = await clearCorpus(pool)
      console.log(`Removed ${removed.articles} articles and ${removed.locations} locations.`)
      return
    }

    if (command === 'status') {
      const counts = await pool.query<{ articles: string; locations: string }>(
        `SELECT
           (SELECT count(*) FROM articles WHERE location LIKE $1) AS articles,
           (SELECT count(*) FROM locations WHERE country = $2) AS locations`,
        [`${CORPUS_COUNTRY}%`, CORPUS_COUNTRY],
      )
      const row = counts.rows[0]!
      console.log(`Synthetic corpus: ${row.articles} articles, ${row.locations} locations.`)
      return
    }

    throw new Error(`Unknown command "${command}". Use build, author, clear or status.`)
  } finally {
    await pool.end()
  }
}

// Only when run directly, so the exported builders can be imported by a
// measurement script without the CLI trying to parse its argv.
if (process.argv[1]?.endsWith('corpus.ts')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
