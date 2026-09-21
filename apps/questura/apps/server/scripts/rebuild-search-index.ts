/**
 * Rebuild `public_search_documents` from the published corpus.
 *
 * The table is kept current by collection hooks. This is for the cases hooks
 * cannot cover: the first deployment after the table is created, a restore, a
 * bulk import that bypassed Payload, or a change to how searchable text is
 * assembled.
 *
 * Connects with `pg` directly rather than through Payload, because the whole
 * point is to run without the application booted, and because reading
 * `DATABASE_URI` is all it needs.
 *
 * `--if-empty` rebuilds only when the table has no rows, which is what the
 * deploy runs: the first deploy after the table is created backfills it, and
 * every later deploy is a single cheap query. A deliberate full rebuild omits
 * the flag.
 *
 * Usage:
 *   npx tsx scripts/rebuild-search-index.ts
 *   npx tsx scripts/rebuild-search-index.ts --if-empty
 */

import 'dotenv/config'
import { Pool } from 'pg'

import {
  rebuildSearchIndex,
  searchIndexHasRows,
} from '../src/features/articles/public/search-index/service'

async function main() {
  const connectionString = process.env.DATABASE_URI
  if (!connectionString) {
    console.error('DATABASE_URI is not set.')
    process.exit(1)
  }

  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 10000 })

  try {
    if (process.argv.includes('--if-empty') && (await searchIndexHasRows(pool))) {
      console.log('public_search_documents already has rows; nothing to backfill.')
      return
    }

    const startedAt = Date.now()
    const rows = await rebuildSearchIndex(pool)
    console.log(`Rebuilt public_search_documents: ${rows} rows in ${Date.now() - startedAt} ms.`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
