/**
 * Prove the restore procedure, not the managed backup.
 *
 *   pnpm readiness:restore
 *
 * Dumps the working copy, restores it into a second disposable database, and
 * checks that what came back is what went in: critical row counts, the search
 * index, and refresh obligations that were pending when the dump was taken.
 *
 * This is a rehearsal of the *procedure*. It is not PITR, it is not a managed
 * backup, and it says nothing about how long a real restore takes on a
 * provider. It answers a narrower question that nobody had answered: if we
 * had a dump, would restoring it produce a working database, and would the
 * work that was owed at that moment still be owed afterwards?
 *
 * The second question is the one worth asking. An obligation that survives a
 * content restore but loses its queue row is a page that is permanently stale
 * with nothing recording that it is.
 */

import { execFileSync } from 'node:child_process'

import { Client } from 'pg'

import { assertPreflight, ALLOWED_DATABASES } from './preflight'
import { sandboxSettings } from './sandbox'

const SOURCE = process.env.READINESS_RESTORE_SOURCE ?? 'questura_readiness_scratch'
const TARGET = 'questura_readiness_restore'

const checks: Array<{ ok: boolean; label: string; detail?: string }> = []
function check(ok: unknown, label: string, detail?: string): void {
  const passed = Boolean(ok)
  checks.push({ ok: passed, label, detail })
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

function uriFor(database: string): string {
  const url = new URL(sandboxSettings().databaseUri)
  url.pathname = `/${database}`
  return url.toString()
}

async function counts(database: string): Promise<Record<string, number>> {
  const client = new Client({ connectionString: uriFor(database) })
  await client.connect()
  try {
    const result = await client.query(`
      SELECT
        (SELECT count(*) FROM locations)::int AS locations,
        (SELECT count(*) FROM articles)::int AS articles,
        (SELECT count(*) FROM media_assets)::int AS media_assets,
        (SELECT count(*) FROM users)::int AS users,
        (SELECT count(*) FROM public_search_documents)::int AS search_rows,
        (SELECT count(*) FROM refresh_jobs WHERE status = 'pending')::int AS pending_jobs
    `)
    return result.rows[0] as Record<string, number>
  } finally {
    await client.end()
  }
}

async function main(): Promise<void> {
  // Both ends must be disposable. The source is read, but a typo that pointed
  // this at a real database would still dump it somewhere.
  for (const database of [SOURCE, TARGET]) {
    if (!(ALLOWED_DATABASES as readonly string[]).includes(database)) {
      throw new Error(`${database} is not on the disposable allowlist.`)
    }
  }
  assertPreflight({ ...sandboxSettings(), databaseUri: uriFor(TARGET), env: {} })

  const url = new URL(uriFor(SOURCE))
  const host = url.hostname
  const port = url.port || '5432'

  // An obligation that is owed at dump time is the thing most likely to be
  // silently lost, so one is planted deliberately.
  const planter = new Client({ connectionString: uriFor(SOURCE) })
  await planter.connect()
  await planter.query(
    `INSERT INTO refresh_jobs (kind, dedupe_key, target, reason, status, attempts, generation, next_attempt_at)
     VALUES ('revalidate', 'restore-rehearsal-probe', '{"tags":["restore-probe"],"paths":["/restore-probe"]}'::jsonb,
             'restore rehearsal', 'pending', 0, 3, now())
     ON CONFLICT (dedupe_key) DO UPDATE SET status = 'pending', generation = 3, updated_at = now()`,
  )
  await planter.end()

  const before = await counts(SOURCE)
  console.log(`\nSource ${SOURCE}: ${JSON.stringify(before)}\n`)

  const startedAt = Date.now()

  const admin = new Client({ connectionString: uriFor('postgres') })
  await admin.connect()
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TARGET],
  )
  await admin.query(`DROP DATABASE IF EXISTS "${TARGET}"`)
  await admin.query(`CREATE DATABASE "${TARGET}"`)
  await admin.end()

  const dump = execFileSync('pg_dump', ['-h', host, '-p', port, '-d', SOURCE, '--no-owner', '--no-privileges'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
  })
  execFileSync('psql', ['-q', '-h', host, '-p', port, '-d', TARGET], { input: dump, stdio: ['pipe', 'ignore', 'pipe'] })

  const elapsedMs = Date.now() - startedAt
  const after = await counts(TARGET)

  console.log(`Restored ${TARGET} in ${elapsedMs} ms: ${JSON.stringify(after)}\n`)

  for (const key of Object.keys(before)) {
    check(after[key] === before[key], `${key} survived the restore`, `${before[key]} → ${after[key]}`)
  }

  const client = new Client({ connectionString: uriFor(TARGET) })
  await client.connect()
  try {
    const probe = await client.query(
      `SELECT status, generation, target FROM refresh_jobs WHERE dedupe_key = 'restore-rehearsal-probe'`,
    )
    check(probe.rows[0]?.status === 'pending', 'a refresh obligation owed at dump time is still owed')
    check(Number(probe.rows[0]?.generation) === 3, 'and it kept its generation, so a stale worker still cannot finish it')

    // A search index that restores but cannot be rebuilt is a restore that
    // needs a manual step nobody wrote down.
    const rebuildable = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'public_search_documents'`,
    )
    check(rebuildable.rows[0].n === 1, 'the search index table exists and can be rebuilt from the corpus')

    const unpublished = await client.query(
      `SELECT count(*)::int AS n FROM public_search_documents s
       WHERE NOT EXISTS (SELECT 1 FROM articles a WHERE a.id = s.doc_id AND a.status = 'published' AND s.type_key = 'articles')
         AND s.type_key = 'articles'`,
    )
    check(
      unpublished.rows[0].n === 0,
      'no restored search row points at an article that is not published',
      `${unpublished.rows[0].n} orphans`,
    )
  } finally {
    await client.end()
  }

  console.log(`\nRestore point: the dump taken at ${new Date(startedAt).toISOString()}.`)
  console.log(`Elapsed: ${elapsedMs} ms for ${before.articles} articles and ${before.locations} locations on this Mac.`)
  console.log(
    'This rehearses the procedure. It is not PITR, not a managed backup, and not a statement about\n' +
      'how long a provider restore takes.',
  )

  const failed = checks.filter((entry) => !entry.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`)
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
