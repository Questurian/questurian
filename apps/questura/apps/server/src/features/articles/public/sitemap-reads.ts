import type { ArticleTypeKey } from './scope'

/**
 * Reads behind `/api/public/sitemap-entries`, bounded and complete.
 *
 * The route used to (a) read every published document of three collections
 * with every field — body blocks included — to use four of them, (b) stop at
 * `limit: 5000` per collection without saying so, so a large corpus silently
 * lost URLs from the sitemap, and (c) run three `count` queries per author to
 * decide who has a public page: 2,000 authors launched 6,000 counts at once.
 */

type FindPage = (args: Record<string, unknown>) => Promise<{
  docs: unknown[]
  hasNextPage?: boolean
  nextPage?: number | null
}>

/** Page size for a sitemap read, and the most rows it will walk before refusing. */
export const SITEMAP_PAGE_SIZE = 1000
export const SITEMAP_MAX_ROWS = 50_000

/**
 * Every matching document, paged, with only the fields asked for. Throws past
 * `maxRows` rather than returning a truncated list: a sitemap that silently
 * drops URLs is worse than a failed build that says why.
 */
export async function readAllPages<T = Record<string, unknown>>(
  find: FindPage,
  args: Record<string, unknown>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? SITEMAP_PAGE_SIZE
  const maxRows = options.maxRows ?? SITEMAP_MAX_ROWS
  const rows: T[] = []
  let page = 1

  for (;;) {
    const result = await find({ ...args, depth: 0, limit: pageSize, page, overrideAccess: true })
    rows.push(...(result.docs as T[]))
    if (rows.length > maxRows) {
      throw new Error(`Sitemap read of ${String(args.collection)} passed ${maxRows} rows; raise the bound deliberately.`)
    }
    if (!result.hasNextPage) return rows
    page = result.nextPage ?? page + 1
  }
}

/** The tables behind each editorial type's `author` relationship. */
export const AUTHOR_TABLES: Record<ArticleTypeKey, string> = {
  articles: 'articles',
  maps: 'single_type_listicles',
  itineraries: 'listicle_itineraries',
}

type Queryable = { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }> }

/**
 * Ids of authors with at least one published item of any of `types`, in any
 * language — the same rule as `hasPublishedAuthorContent` (byline implies
 * visibility), answered by one grouped query instead of three counts per
 * author.
 */
export async function authorsWithPublishedContent(
  pool: Queryable,
  types: ArticleTypeKey[],
): Promise<Set<string>> {
  if (types.length === 0) return new Set()
  const sql = types
    .map(
      (type) =>
        `SELECT author_id FROM ${AUTHOR_TABLES[type]} WHERE status = 'published' AND author_id IS NOT NULL`,
    )
    .join('\nUNION\n')
  const result = await pool.query(sql)
  return new Set(result.rows.map((row) => String(row.author_id)))
}
