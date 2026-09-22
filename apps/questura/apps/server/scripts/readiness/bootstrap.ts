import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from 'pg'

import { createSandboxDatabase, dropSandboxDatabase, sandboxDatabaseName, sandboxDatabaseUri } from './database'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'

/**
 * A full Questura schema in the disposable database, from a clean checkout.
 *
 *   pnpm readiness bootstrap        # drop, load the fixture, migrate forward
 *   pnpm readiness fixture-refresh  # rewrite the fixture from a migrated sandbox
 *
 * `pnpm db:migrate` cannot build a database from empty: the earliest
 * committed migration assumes tables that predate the chain. The previous
 * answer was `readiness copy-from <db>`, which reads a developer's database —
 * and so depended on whatever that database held, and could copy personal
 * data. This replaces it for every readiness run:
 *
 *  1. Load `fixtures/schema.sql` with `ON_ERROR_STOP=1`: the schema plus the
 *     `payload_migrations` ledger, **no content, accounts or credentials**.
 *  2. Run `payload migrate` against the sandbox, so any migration newer than
 *     the fixture is applied by the real migration code.
 *  3. Refuse unless every migration file in `src/migrations` is in the
 *     ledger afterwards.
 *
 * Provenance: the fixture was produced by loading a schema-only dump into the
 * scratch sandbox, migrating it to HEAD with `payload migrate`, and dumping
 * that (2026-09-22). No data left the source. `fixture-refresh` repeats the
 * last step from a sandbox that has just been bootstrapped and migrated.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

export const FIXTURE_PATH = resolve(HERE, 'fixtures/schema.sql')
const MIGRATIONS_DIR = resolve(HERE, '../../src/migrations')
const DENY_OUTBOUND = resolve(HERE, 'deny-outbound.cjs')

function connection(uri: string): { host: string; port: string; database: string; user: string } {
  const url = new URL(uri)
  return {
    host: url.hostname,
    port: url.port || '5432',
    database: url.pathname.replace(/^\//, ''),
    user: decodeURIComponent(url.username) || process.env.USER || 'postgres',
  }
}

/** Migration names the repository ships, from the files themselves. */
export function repositoryMigrations(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((file) => /^\d{8}_\d{6}_.+\.ts$/.test(file))
    .map((file) => file.replace(/\.ts$/, ''))
    .sort()
}

/** Migration names the fixture's ledger records, read without a database. */
export function fixtureMigrations(path = FIXTURE_PATH): string[] {
  const text = readFileSync(path, 'utf8')
  const names = [...text.matchAll(/INSERT INTO public\.payload_migrations[^;]*?VALUES \(\d+, '([^']+)'/g)].map(
    (match) => match[1]!,
  )
  return [...new Set(names)].sort()
}

/** Anything in the fixture that is not schema or the migration ledger. */
export function fixtureDataProblems(path = FIXTURE_PATH): string[] {
  const text = readFileSync(path, 'utf8')
  const problems: string[] = []
  if (/^COPY /m.test(text)) problems.push('The fixture contains COPY data.')
  for (const match of text.matchAll(/^INSERT INTO ([^\s(]+)/gm)) {
    if (match[1] !== 'public.payload_migrations') problems.push(`The fixture inserts into ${match[1]}.`)
  }
  return [...new Set(problems)]
}

function psql(uri: string, args: string[], input?: string): void {
  const target = connection(uri)
  const result = spawnSync(
    'psql',
    ['-q', '-X', '-v', 'ON_ERROR_STOP=1', '-h', target.host, '-p', target.port, '-U', target.user, '-d', target.database, ...args],
    { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  if (result.status !== 0) {
    throw new Error(`psql failed (exit ${result.status}): ${(result.stderr || '').trim().slice(0, 600)}`)
  }
}

/** The environment `payload migrate` runs with: the sandbox, and nothing that can reach a paid service. */
export function migrationEnv(uri: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    NODE_ENV: 'development',
    NODE_OPTIONS: `--no-deprecation --require ${DENY_OUTBOUND}`,
    DATABASE_URI: uri,
    DATABASE_URI_UNPOOLED: uri,
    PG_STATEMENT_TIMEOUT_MS: '0',
    PG_LOCK_TIMEOUT_MS: '0',
    PG_IDLE_IN_TRANSACTION_TIMEOUT_MS: '0',
    PAYLOAD_SECRET: 'readiness-payload-secret-not-a-real-one-0123456789abcdef0123',
    BETTER_AUTH_SECRET: 'readiness-visitor-secret-not-a-real-one-0123456789abcdef01',
    // `.env` fills in anything unset; these are set so it cannot.
    REDIS_URL: '',
    STRIPE_SECRET_KEY: 'sk_readiness_placeholder_not_a_key',
    BUNNY_API_KEY: '',
    BUNNY_STORAGE_API_KEY: '',
    RESEND_API_KEY: '',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    GOOGLE_MAPS_API_KEY: '',
  }
}

async function ledger(uri: string): Promise<string[]> {
  const client = new Client({ connectionString: uri })
  await client.connect()
  try {
    const result = await client.query<{ name: string }>('SELECT name FROM payload_migrations ORDER BY name')
    return result.rows.map((row) => row.name)
  } finally {
    await client.end()
  }
}

export async function bootstrapSandbox(): Promise<{ database: string; migrated: string[]; tables: number }> {
  assertPreflight(sandboxSettings())
  const uri = sandboxDatabaseUri()

  const dataProblems = fixtureDataProblems()
  if (dataProblems.length > 0) throw new Error(`Refusing a fixture that carries data:\n  ${dataProblems.join('\n  ')}`)

  await dropSandboxDatabase()
  await createSandboxDatabase()
  psql(uri, ['-f', FIXTURE_PATH])

  const before = new Set(await ledger(uri))
  const migrate = spawnSync('node_modules/.bin/payload', ['migrate'], {
    cwd: resolve(HERE, '../..'),
    env: migrationEnv(uri),
    encoding: 'utf8',
    input: '',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (migrate.status !== 0) {
    throw new Error(`payload migrate failed (exit ${migrate.status}):\n${(migrate.stdout + migrate.stderr).slice(-1500)}`)
  }

  const after = await ledger(uri)
  const missing = repositoryMigrations().filter((name) => !after.includes(name))
  if (missing.length > 0) {
    throw new Error(`After migrating, the ledger still lacks: ${missing.join(', ')}`)
  }

  const client = new Client({ connectionString: uri })
  await client.connect()
  const tables = await client
    .query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`)
    .finally(() => client.end())

  return {
    database: sandboxDatabaseName(),
    migrated: after.filter((name) => !before.has(name)),
    tables: tables.rows[0]!.n,
  }
}

/** Rewrite the fixture from the (bootstrapped, migrated) sandbox. Schema and ledger only. */
export function refreshFixture(): void {
  assertPreflight(sandboxSettings())
  const target = connection(sandboxDatabaseUri())
  const base = ['-h', target.host, '-p', target.port, '-U', target.user, '-d', target.database, '--no-owner']
  const schema = execFileSync('pg_dump', [...base, '--schema-only', '--no-privileges', '--no-comments'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  const migrations = execFileSync('pg_dump', [...base, '--data-only', '--inserts', '-t', 'payload_migrations'], {
    encoding: 'utf8',
  })

  const header = [
    '-- Questura schema fixture for the disposable readiness sandbox (surge plan L01).',
    '-- Schema only, plus the payload_migrations ledger. No content, accounts or credentials.',
    '-- Regenerate: pnpm readiness fixture-refresh (see scripts/readiness/bootstrap.ts).',
    '',
  ].join('\n')
  const ledgerLines = migrations
    .split('\n')
    .filter((line) => line.startsWith('INSERT') || line.startsWith('SELECT pg_catalog.setval'))
  const body = schema
    .split('\n')
    .filter((line) => !line.startsWith('-- Dumped ') && !line.startsWith('SET transaction_timeout'))
    .join('\n')

  writeFileSync(
    FIXTURE_PATH,
    `${header}\n${body}\n\n-- The migration ledger, so 'payload migrate' applies only what is newer than this fixture.\n${ledgerLines.join('\n')}\n`,
  )
  const problems = fixtureDataProblems()
  if (problems.length > 0) throw new Error(`The refreshed fixture carries data: ${problems.join('; ')}`)
}

export function fixtureExists(): boolean {
  return existsSync(FIXTURE_PATH)
}
