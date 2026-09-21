/**
 * Exercise the refresh outbox's SQL against a real Postgres, inside one
 * transaction that is always rolled back: nothing it writes survives.
 *
 *   pnpm exec tsx scripts/verify-refresh-outbox.ts
 *
 * Unit tests mock the database, so they cannot prove the claim/retry/merge SQL
 * does what the comments say. This does, against the real schema (the
 * `refresh_jobs` migration must be applied). Revalidation delivery is pointed
 * at an address that refuses connections, so a revalidate job fails and
 * retries; search jobs use an id that does not exist, so they succeed without
 * changing the index.
 */

import 'dotenv/config'
import { PgDialect } from '@payloadcms/db-postgres/drizzle/pg-core'
import { Client } from 'pg'

import { enqueueRefreshJob, revalidateDedupeKey, searchIndexDedupeKey } from '../src/features/refresh-outbox/enqueue'
import { CLAIM_MS, MAX_ATTEMPTS, drainRefreshJobs, refreshJobStats } from '../src/features/refresh-outbox/worker'

const dialect = new PgDialect()

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAILED: ${message}`)
  console.log(`ok   ${message}`)
}

async function main() {
  process.env.QUESTURA_CLIENT_URL = 'http://127.0.0.1:9' // refuses connections
  process.env.QUESTURA_REVALIDATION_SECRET = 'verify'

  const client = new Client({ connectionString: process.env.DATABASE_URI })
  await client.connect()
  await client.query('BEGIN')

  // Everything below shares the one connection, so it all rolls back.
  const pool = { query: (text: string, values?: unknown[]) => client.query(text, values), connect: undefined }
  const drizzle = {
    execute: (query: unknown) => {
      const { sql, params } = dialect.sqlToQuery(query as never)
      return client.query(sql, params)
    },
  }
  const req = { payload: { db: { drizzle, pool } } }
  const rows = async (key: string) =>
    (await client.query('SELECT status, attempts::int AS attempts, target, next_attempt_at > now() AS later FROM refresh_jobs WHERE dedupe_key = $1', [key])).rows

  try {
    const target = { tags: ['verify:tag'], paths: ['/verify'] }
    const key = revalidateDedupeKey(target)
    await enqueueRefreshJob(req as never, { kind: 'revalidate', dedupeKey: key, target, reason: 'verify:1' })
    await enqueueRefreshJob(req as never, { kind: 'revalidate', dedupeKey: key, target, reason: 'verify:2' })
    check((await rows(key)).length === 1, 'a repeated change merges into one row')
    const merged = (await rows(key))[0]?.target as { tags?: string[]; paths?: string[] }
    check(merged?.tags?.[0] === 'verify:tag' && merged?.paths?.[0] === '/verify', 'merging keeps the tags and paths')
    const otherTarget = { tags: ['verify:other'], paths: [] }
    const otherKey = revalidateDedupeKey(otherTarget)
    check(otherKey !== key, 'different targets get different keys')

    const searchKey = searchIndexDedupeKey('articles', 2147480000)
    await enqueueRefreshJob(req as never, {
      kind: 'search-index',
      dedupeKey: searchKey,
      target: { type: 'articles', id: '2147480000' },
      reason: 'verify',
    })

    // now() is frozen inside this one transaction and next_attempt_at keeps
    // milliseconds only, so a just-enqueued row can round to a hair after
    // now(). Real drains run in later transactions; age the rows instead.
    await client.query(`UPDATE refresh_jobs SET next_attempt_at = now() - interval '1 second'`)
    const first = await drainRefreshJobs(pool as never)
    check(first.claimed >= 2, `a drain claims due jobs (claimed ${first.claimed})`)
    check((await rows(searchKey))[0]?.status === 'done', 'a search job for a missing document completes (row removed, nothing inserted)')
    const afterFail = (await rows(key))[0]
    check(afterFail?.status === 'pending' && afterFail.attempts === 1 && afterFail.later, 'a failed delivery is retried later, not dropped')

    const again = await drainRefreshJobs(pool as never)
    check(again.claimed === 0, 'a job in backoff is not claimed early')

    await client.query(`UPDATE refresh_jobs SET status = 'running', locked_until = now() - interval '1 second' WHERE dedupe_key = $1`, [key])
    const reclaimed = await client.query(
      `UPDATE refresh_jobs SET next_attempt_at = now() - interval '1 second' WHERE dedupe_key = $1 RETURNING id`,
      [key],
    )
    check(reclaimed.rowCount === 1, 'setup: stuck claim with an expired lock')
    const recovered = await drainRefreshJobs(pool as never)
    check(recovered.claimed >= 1, 'a claim whose worker died is taken over after its lock expires')

    await client.query(`UPDATE refresh_jobs SET attempts = $2 - 1, next_attempt_at = now() - interval '1 second' WHERE dedupe_key = $1`, [key, MAX_ATTEMPTS])
    const exhausted = await drainRefreshJobs(pool as never)
    check(exhausted.failed === 1 && (await rows(key))[0]?.status === 'failed', `after ${MAX_ATTEMPTS} attempts the job is kept as failed`)

    await enqueueRefreshJob(req as never, { kind: 'revalidate', dedupeKey: key, target, reason: 'verify:3' })
    const reset = (await rows(key))[0]
    check(reset?.status === 'pending' && reset.attempts === 0, 'a new change revives a failed job with fresh attempts')

    await client.query(`UPDATE refresh_jobs SET status = 'running', locked_until = now() + interval '${CLAIM_MS} milliseconds' WHERE dedupe_key = $1`, [key])
    await enqueueRefreshJob(req as never, { kind: 'revalidate', dedupeKey: key, target, reason: 'verify:4' })
    await client.query(`UPDATE refresh_jobs SET status = 'done' WHERE dedupe_key = $1 AND status = 'running'`, [key])
    check((await rows(key))[0]?.status === 'pending', 'a change arriving mid-run is not lost when the run completes')

    const stats = await refreshJobStats(pool as never)
    check(typeof stats.pending === 'number', `stats report (${JSON.stringify(stats)})`)
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
  console.log('All outbox checks passed; transaction rolled back.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
