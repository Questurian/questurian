/**
 * A restore is proved by a restored *service*, not by restored row counts
 * (surge plan L09).
 *
 *   pnpm readiness bootstrap && pnpm readiness:launch -- seed
 *   pnpm readiness:stack -- up           # for its server build and Redis
 *   pnpm readiness:restore
 *
 * Dumps the launch sandbox, restores it into `questura_readiness_restore`,
 * and then does what a person restoring production would have to do before
 * calling it done — each step a gate that can fail:
 *
 *  1. **Restore with error-stop.** `psql -v ON_ERROR_STOP=1 --single-transaction`,
 *     exit code checked. The old procedure ran psql without ON_ERROR_STOP,
 *     so a broken statement was skipped and the restore reported success.
 *     A deliberately corrupted dump must be refused (negative control).
 *  2. **Counts and the owed work.** Critical rows match, and a refresh
 *     obligation pending at dump time is still pending with its generation.
 *  3. **Boot the real app** on the restored database (the stack's
 *     `.next-readiness` build, on port 4102) and wait for it to be ready.
 *  4. **Search serves.** Before a rebuild, the search gate is run against an
 *     emptied index and must fail (the control that shows the gate is not a
 *     table-exists check); after `rebuildSearchIndex`, a marker search must
 *     return exactly the expected piece and nothing unpublished.
 *  5. **Owed work is delivered.** Before draining, the "nothing owed" gate
 *     must fail; after draining into a loopback receiver, the planted
 *     obligation's paths were delivered and nothing is left pending.
 *  6. **Public and private responses.** A public article read carries its
 *     title and body markers; member A signs in to the restored backend
 *     with the restored password hash, `/api/me` is exactly member A, the
 *     member body carries its marker, and A's bookmark refs are exactly A's.
 *  7. **Relations.** Profiles have accounts, bookmarks point at readers and
 *     targets that exist, media sets point at assets that exist, published
 *     pieces point at featured images that exist.
 *
 * A rehearsal of the procedure: not PITR, not a managed backup, not a
 * statement about how long a provider restore takes.
 *
 * **Postgres major.** Production is Neon on Postgres 17; the sandbox
 * container is 16. The run records the server and client versions, and
 * refuses a `pg_dump` older than the server (it cannot dump it faithfully).
 * `READINESS_PG_BINDIR` names the directory holding `pg_dump`/`psql` when the
 * ones on PATH are too old, and `READINESS_RESTORE_EXPECT_MAJOR=17` makes the
 * major a gate. The restore reads the dump from stdin, so a client wrapper
 * (e.g. `docker run -i postgres:17 psql`) works as well as a local binary.
 *
 * **`--db-only`.** Gates 3 and 6 and the HTTP half of gate 4 need the stack's
 * server build. With `--db-only` the run needs only Postgres: 1, 2, 5, 7 and
 * the index rebuild still run, the rest are listed as skipped, and the run is
 * written as partial evidence — never as a full pass. It is how the restore is
 * proven on a throwaway Postgres 17 while the sandbox stack is busy:
 *
 *   READINESS_DATABASE_URI=postgres://postgres@127.0.0.1:<port>/questura_readiness \
 *   READINESS_PG_BINDIR=<dir with pg_dump/psql 17> READINESS_RESTORE_EXPECT_MAJOR=17 \
 *     pnpm readiness:restore -- --db-only
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Client, Pool } from 'pg'

import { backendEnv, startApp, waitForApp, SERVER_DIR } from './apps'
import { FaultReceiver } from './fault-receiver'
import { signIn } from './identities'
import { LAUNCH_MANIFEST_PATH, type LaunchManifest } from './launch-corpus'
import { assertPreflight, ALLOWED_DATABASES } from './preflight'
import { sandboxSettings, sourceIdentity } from './sandbox'
import { readStackState, STACK_DIST, STACK_PORTS } from './stack'

const SOURCE = process.env.READINESS_RESTORE_SOURCE ?? 'questura_readiness'
const TARGET = 'questura_readiness_restore'
const CONTROL = 'questura_readiness_scratch'
const RESTORED_PORT = 4102
const RUNS = resolve(process.cwd(), '../../docs/capacity/runs')
const DB_ONLY = process.argv.slice(2).includes('--db-only')
const PG_BINDIR = process.env.READINESS_PG_BINDIR?.trim()
const EXPECT_MAJOR = process.env.READINESS_RESTORE_EXPECT_MAJOR?.trim()

const skipped: string[] = []
function skip(label: string): void {
  skipped.push(label)
  console.log(`skip ${label} — needs the stack (run without --db-only)`)
}

function pgTool(name: 'pg_dump' | 'psql'): string {
  return PG_BINDIR ? join(PG_BINDIR, name) : name
}

/** Major version of a client tool, from `<tool> --version`. */
function toolVersion(name: 'pg_dump' | 'psql'): string {
  const output = execFileSync(pgTool(name), ['--version'], { encoding: 'utf8' })
  const match = output.match(/(\d+)(?:\.(\d+))?/)
  if (!match) throw new Error(`Cannot read the ${name} version from: ${output.trim()}`)
  return match[2] ? `${match[1]}.${match[2]}` : match[1]!
}

async function serverVersion(database: string): Promise<string> {
  const client = new Client({ connectionString: uriFor(database) })
  await client.connect()
  try {
    return String((await client.query('SHOW server_version')).rows[0].server_version).split(' ')[0]!
  } finally {
    await client.end()
  }
}

const major = (version: string): number => Number.parseInt(version, 10)

type Check = { ok: boolean; label: string; detail?: string }
const checks: Check[] = []
function check(ok: unknown, label: string, detail?: string): boolean {
  const passed = Boolean(ok)
  checks.push({ ok: passed, label, detail })
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  return passed
}

function uriFor(database: string): string {
  const url = new URL(sandboxSettings().databaseUri)
  url.pathname = `/${database}`
  return url.toString()
}

function connection(database: string): string[] {
  const url = new URL(uriFor(database))
  return ['-h', url.hostname, '-p', url.port || '5432', ...(url.username ? ['-U', decodeURIComponent(url.username)] : []), '-d', database]
}

async function recreate(database: string): Promise<void> {
  const admin = new Client({ connectionString: uriFor('postgres') })
  await admin.connect()
  try {
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [database])
    // `database` is one of the three allowlisted literals.
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`)
    await admin.query(`CREATE DATABASE "${database}"`)
  } finally {
    await admin.end()
  }
}

/** Restore a plain dump. Throws on the first SQL error; the whole restore is one transaction. */
function restore(database: string, dumpPath: string): { ok: boolean; stderr: string } {
  // stdin rather than `-f`, so a containerised psql needs no shared path.
  const result = spawnSync(pgTool('psql'), ['-q', '-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction', ...connection(database)], {
    input: readFileSync(dumpPath),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  return { ok: result.status === 0, stderr: (result.stderr || '').trim().slice(0, 300) }
}

async function counts(database: string): Promise<Record<string, number>> {
  const client = new Client({ connectionString: uriFor(database) })
  await client.connect()
  try {
    const result = await client.query(`
      SELECT
        (SELECT count(*) FROM locations)::int AS locations,
        (SELECT count(*) FROM articles)::int AS articles,
        (SELECT count(*) FROM single_type_listicles)::int AS maps,
        (SELECT count(*) FROM listicle_itineraries)::int AS itineraries,
        (SELECT count(*) FROM media_assets)::int AS media_assets,
        (SELECT count(*) FROM media_sets)::int AS media_sets,
        (SELECT count(*) FROM users)::int AS users,
        (SELECT count(*) FROM visitor_auth_users)::int AS visitors,
        (SELECT count(*) FROM visitor_auth_accounts)::int AS visitor_accounts,
        (SELECT count(*) FROM visitor_profiles)::int AS visitor_profiles,
        (SELECT count(*) FROM bookmarks)::int AS bookmarks,
        (SELECT count(*) FROM public_search_documents)::int AS search_rows,
        (SELECT count(*) FROM refresh_jobs WHERE status = 'pending')::int AS pending_jobs
    `)
    return result.rows[0] as Record<string, number>
  } finally {
    await client.end()
  }
}

async function main(): Promise<void> {
  for (const database of [SOURCE, TARGET, CONTROL]) {
    if (!(ALLOWED_DATABASES as readonly string[]).includes(database)) throw new Error(`${database} is not on the disposable allowlist.`)
  }
  assertPreflight({ ...sandboxSettings(), databaseUri: uriFor(TARGET) })
  const stack = DB_ONLY ? null : readStackState()
  if (!DB_ONLY && !stack) {
    throw new Error('The restored-service gate boots the stack’s server build: run `pnpm readiness:stack -- up` first (or `-- --db-only` for the database half).')
  }
  const manifest = JSON.parse(readFileSync(LAUNCH_MANIFEST_PATH, 'utf8')) as LaunchManifest
  const work = mkdtempSync(join(tmpdir(), 'questura-restore-'))

  // --- 0. Versions: which Postgres, and a client that can dump it ------------
  const versions = {
    source: await serverVersion(SOURCE),
    pgDump: toolVersion('pg_dump'),
    psql: toolVersion('psql'),
    target: '',
  }
  if (major(versions.pgDump) < major(versions.source)) {
    throw new Error(
      `pg_dump ${versions.pgDump} cannot dump a Postgres ${versions.source} server. ` +
        'Point READINESS_PG_BINDIR at a pg_dump/psql of the same major or newer.',
    )
  }

  // An obligation owed at dump time is the thing most likely to be lost.
  // Scheduled an hour ahead so the stack's own worker, which is draining the
  // source database, cannot deliver it before the dump is taken.
  const planter = new Client({ connectionString: uriFor(SOURCE) })
  await planter.connect()
  await planter.query(
    `INSERT INTO refresh_jobs (kind, dedupe_key, target, reason, status, attempts, generation, next_attempt_at)
     VALUES ('revalidate', 'restore-rehearsal-probe', '{"tags":["restore-probe"],"paths":["/restore-probe"]}'::jsonb,
             'restore rehearsal', 'pending', 0, 3, now() + interval '1 hour')
     ON CONFLICT (dedupe_key) DO UPDATE SET status = 'pending', generation = 3, attempts = 0,
       next_attempt_at = now() + interval '1 hour', updated_at = now()`,
  )
  await planter.end()

  const before = await counts(SOURCE)
  const startedAt = Date.now()
  const dumpPath = join(work, 'dump.sql')
  writeFileSync(
    dumpPath,
    execFileSync(pgTool('pg_dump'), [...connection(SOURCE), '--no-owner', '--no-privileges'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 }),
  )
  const dumpMs = Date.now() - startedAt

  // --- 1. Error-stop, and the control that proves it ----------------------
  const corrupt = join(work, 'corrupt.sql')
  const text = readFileSync(dumpPath, 'utf8')
  const middle = text.indexOf('\nCREATE TABLE', Math.floor(text.length / 2))
  writeFileSync(corrupt, `${text.slice(0, middle)}\nTHIS IS NOT SQL;\n${text.slice(middle)}`)
  await recreate(CONTROL)
  const refused = restore(CONTROL, corrupt)
  check(!refused.ok, 'a dump with a broken statement is refused, not half-restored', refused.stderr.split('\n')[0])
  const controlTables = new Client({ connectionString: uriFor(CONTROL) })
  await controlTables.connect()
  const leftover = await controlTables.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`)
  await controlTables.end()
  check(leftover.rows[0].n === 0, 'and the refused restore left nothing behind (single transaction)', `${leftover.rows[0].n} tables`)

  await recreate(TARGET)
  versions.target = await serverVersion(TARGET)
  if (EXPECT_MAJOR) {
    check(major(versions.target) === Number(EXPECT_MAJOR), `the restore target runs Postgres ${EXPECT_MAJOR}`, `server ${versions.target}, pg_dump ${versions.pgDump}, psql ${versions.psql}`)
  }
  const restoreStartedAt = Date.now()
  const restored = restore(TARGET, dumpPath)
  check(restored.ok, 'the real dump restores with ON_ERROR_STOP', restored.stderr)
  const restoreOnlyMs = Date.now() - restoreStartedAt
  const restoreMs = Date.now() - startedAt

  // --- 2. Counts and owed work ------------------------------------------------
  const after = await counts(TARGET)
  for (const key of Object.keys(before)) check(after[key] === before[key], `${key} survived`, `${before[key]} → ${after[key]}`)

  const target = new Pool({ connectionString: uriFor(TARGET), max: 4 })
  const probe = await target.query(`SELECT status, generation FROM refresh_jobs WHERE dedupe_key = 'restore-rehearsal-probe'`)
  check(probe.rows[0]?.status === 'pending' && Number(probe.rows[0]?.generation) === 3, 'the obligation owed at dump time is still owed, generation intact')

  // --- 3. Boot the app on the restored database -------------------------------
  const receiver = new FaultReceiver()
  const receiverPort = await receiver.listen()
  const revalidationSecret = stack?.secrets.revalidation ?? randomBytes(24).toString('hex')
  receiver.expectedSecret = revalidationSecret
  const settings = stack && {
    ports: { backend: RESTORED_PORT, client: receiverPort },
    databaseUri: uriFor(TARGET),
    redisUri: `redis://127.0.0.1:${STACK_PORTS.redis}`,
    dist: STACK_DIST,
    revalidationSecret,
    dbStatsSecret: stack.secrets.dbStats,
    instanceId: 'readiness-restored-backend',
    browser: { clientOrigin: stack.origins.client, backendOrigin: 'http://api-restored.readiness.localhost:4102' },
    outboundLog: stack.outboundLog,
    stripeStubUrl: `http://127.0.0.1:${STACK_PORTS.stripe}`,
  }
  const backend = settings ? startApp('restored', SERVER_DIR(), RESTORED_PORT, backendEnv(settings)) : null
  const base = `http://127.0.0.1:${RESTORED_PORT}`

  try {
    if (backend) {
      const ready = await waitForApp(`${base}/api/me`, 120_000)
      check(ready, 'the backend boots on the restored database')
      if (!ready) throw new Error('The restored backend did not start; later gates would measure nothing.')
    } else {
      skip('the backend boots on the restored database')
    }

    // --- 4. Search: the gate must fail on an empty index, pass after rebuild ---
    // An empty index still answers — the route falls back to a slower corpus
    // query by design — so "serves the right result" is not enough. The gate
    // also requires the answer to have come from the index (the route reports
    // its source in `Server-Timing` when diagnostics are on).
    const published = manifest.pieces.filter((piece) => piece.status === 'published')
    const needle = published.find((piece) => piece.type === 'articles' && piece.index === 7)!
    const searchGate = async () => {
      const response = await fetch(`${base}/api/public/articles/search?q=${encodeURIComponent(needle.markers.title)}&lang=en`, {
        headers: { 'cf-connecting-ip': '192.0.2.200' },
      })
      const body = (await response.json().catch(() => null)) as { totalDocs?: number; items?: Array<{ href?: string }> } | null
      const fromIndex = /search;desc="index"/.test(response.headers.get('server-timing') ?? '')
      return response.status === 200 && fromIndex && body?.totalDocs === 1 && body.items?.[0]?.href === needle.path
    }
    await target.query('TRUNCATE public_search_documents')
    if (backend) check(!(await searchGate()), 'control: with the index emptied, the search gate fails (the fallback answer is not the index)')
    else skip('control: with the index emptied, the search gate fails (the fallback answer is not the index)')
    const { rebuildSearchIndex } = await import('../../src/features/articles/public/search-index/service')
    const rows = await rebuildSearchIndex(target as never)
    check(rows === published.length, 'the search index rebuilds from the restored corpus', `${rows} rows for ${published.length} published pieces`)
    if (backend) check(await searchGate(), 'a marker search returns exactly the expected piece, from the index')
    else skip('a marker search returns exactly the expected piece, from the index')
    const orphans = await target.query(
      `SELECT count(*)::int AS n FROM public_search_documents s
       WHERE s.type_key = 'articles' AND NOT EXISTS (SELECT 1 FROM articles a WHERE a.id = s.doc_id AND a.status = 'published')`,
    )
    check(orphans.rows[0].n === 0, 'no search row points at an unpublished article', `${orphans.rows[0].n}`)

    // --- 5. Owed work: the gate must fail before the drain ----------------------
    const owed = async () => (await target.query(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status IN ('pending','running')`)).rows[0].n as number
    check((await owed()) > 0, 'control: before draining, the "nothing owed" gate fails', `${await owed()} owed`)
    // Owed work replayed now, as an operator finishing a restore would.
    await target.query(`UPDATE refresh_jobs SET next_attempt_at = now() WHERE status = 'pending'`)
    process.env.QUESTURA_CLIENT_URL = `http://127.0.0.1:${receiverPort}`
    process.env.QUESTURA_REVALIDATION_SECRET = revalidationSecret
    const { drainRefreshJobs } = await import('../../src/features/refresh-outbox/worker')
    for (let pass = 0; pass < 10 && (await owed()) > 0; pass += 1) await drainRefreshJobs(target as never, { maxJobs: 500 })
    check((await owed()) === 0, 'after draining, nothing is owed')
    check(receiver.allPaths().has('/restore-probe'), 'the obligation owed at dump time was delivered')

    // --- 6. Public and private responses -----------------------------------------
    if (backend && stack) {
      const article = await fetch(`${base}/api/public/articles/by-canonical-path?path=${encodeURIComponent(needle.path)}&lang=en`, {
        headers: { 'cf-connecting-ip': '192.0.2.201' },
      })
      const articleText = await article.text()
      check(
        article.status === 200 && articleText.includes(needle.markers.title) && articleText.includes(needle.markers.body),
        'a public article read carries its title and body markers',
        `HTTP ${article.status}`,
      )

      const memberA = manifest.identities.find((identity) => identity.label === 'member-a')!
      const cookie = await signIn(base, stack.origins.client, memberA.email, '192.0.2.202')
      const me = (await (await fetch(`${base}/api/me`, { headers: { origin: stack.origins.client, cookie } })).json()) as {
        principal?: { email?: string; membership?: { active?: boolean } }
      }
      check(me.principal?.email === memberA.email && me.principal?.membership?.active === true, 'member A signs in with the restored password and is exactly member A')
      const gated = published.find((piece) => piece.access === 'member')!
      const body = await fetch(`${base}/api/public/articles/full?type=${gated.type}&id=${gated.id}&lang=en`, {
        headers: { origin: stack.origins.client, cookie, 'cf-connecting-ip': '192.0.2.203' },
      })
      check(body.status === 200 && (await body.text()).includes(gated.markers.member!), 'the restored member body is served to the restored member')
      const refs = (await (await fetch(`${base}/api/account/bookmarks/refs`, { headers: { origin: stack.origins.client, cookie } })).json()) as {
        refs?: Array<{ targetType: string; targetId: number }>
      }
      const got = (refs.refs ?? []).map((ref) => `${ref.targetType}:${ref.targetId}`).sort()
      const want = memberA.bookmarks.map((ref) => `${ref.targetType}:${ref.targetId}`).sort()
      check(JSON.stringify(got) === JSON.stringify(want), 'member A’s restored bookmarks are exactly A’s', got.join(','))
    } else {
      skip('a public article read carries its title and body markers')
      skip('member A signs in with the restored password and is exactly member A')
      skip('the restored member body is served to the restored member')
      skip('member A’s restored bookmarks are exactly A’s')
    }

    // --- 7. Relations -----------------------------------------------------------
    const relation = async (label: string, sql: string) => {
      const n = (await target.query(sql)).rows[0].n as number
      check(n === 0, label, `${n} broken`)
    }
    await relation('every visitor profile has an auth user', `SELECT count(*)::int AS n FROM visitor_profiles p WHERE NOT EXISTS (SELECT 1 FROM visitor_auth_users u WHERE u.id = p.auth_user_id)`)
    await relation('every credential account has an auth user', `SELECT count(*)::int AS n FROM visitor_auth_accounts a WHERE NOT EXISTS (SELECT 1 FROM visitor_auth_users u WHERE u.id = a."userId")`)
    await relation('every bookmark has a reader', `SELECT count(*)::int AS n FROM bookmarks b WHERE NOT EXISTS (SELECT 1 FROM visitor_auth_users u WHERE u.id = b.auth_user_id)`)
    await relation(
      'every bookmark points at a target that exists',
      `SELECT count(*)::int AS n FROM bookmarks b WHERE NOT (
         (b.target_type = 'articles' AND EXISTS (SELECT 1 FROM articles x WHERE x.id = b.target_id)) OR
         (b.target_type = 'maps' AND EXISTS (SELECT 1 FROM single_type_listicles x WHERE x.id = b.target_id)) OR
         (b.target_type = 'itineraries' AND EXISTS (SELECT 1 FROM listicle_itineraries x WHERE x.id = b.target_id)))`,
    )
    await relation(
      'every media-set variant points at an asset that exists',
      `SELECT count(*)::int AS n FROM media_sets s WHERE
         (s.variants_hero_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM media_assets a WHERE a.id = s.variants_hero_id)) OR
         (s.variants_wide_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM media_assets a WHERE a.id = s.variants_wide_id))`,
    )
    await relation(
      'every published article’s featured image exists',
      `SELECT count(*)::int AS n FROM articles x WHERE x.status = 'published' AND x.header_section_featured_image_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM media_assets a WHERE a.id = x.header_section_featured_image_id)`,
    )
  } finally {
    backend?.kill('SIGTERM')
    await receiver.close()
    await target.end()
  }

  const failed = checks.filter((entry) => !entry.ok)
  const stamp = new Date().toISOString().slice(0, 10)
  // A --db-only run is partial evidence and is written under its own name, so
  // it can never be read as (or overwrite) a full restored-service run.
  // A full run on a major other than the sandbox's is named by that major too,
  // so a Postgres 17 proof never overwrites the day's ordinary run.
  const suffix = DB_ONLY ? `-db-only-pg${major(versions.target)}` : EXPECT_MAJOR ? `-pg${major(versions.target)}` : ''
  writeFileSync(
    resolve(RUNS, `${stamp}-surge-L09-restore${suffix}.json`),
    JSON.stringify(
      {
        kind: DB_ONLY ? 'surge-restore-rehearsal-db-only' : 'surge-restore-rehearsal',
        takenAt: new Date().toISOString(),
        source: sourceIdentity(),
        from: SOURCE,
        to: TARGET,
        postgres: versions,
        restoreMs,
        dumpMs,
        restoreOnlyMs,
        countsBefore: before,
        countsAfter: after,
        result: { total: checks.length, passed: checks.length - failed.length },
        checks,
        skipped,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    `\nPostgres ${versions.source} → ${versions.target} (pg_dump ${versions.pgDump}). Dump ${dumpMs} ms, restore ${restoreOnlyMs} ms, ` +
      `${restoreMs} ms end to end with the refused control. ${checks.length - failed.length}/${checks.length} checks passed.`,
  )
  if (skipped.length > 0) console.log(`PARTIAL: ${skipped.length} restored-service gates skipped (--db-only). This is not a full restore proof.`)
  if (failed.length > 0) process.exit(1)
  process.exit(0)
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
