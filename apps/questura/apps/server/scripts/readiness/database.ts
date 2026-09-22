import { Client, Pool } from 'pg'

import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'

/**
 * Real connections to the disposable database.
 *
 * The plan is explicit that a single rolled-back transaction on one
 * connection cannot prove commit visibility, worker competition or crash
 * recovery — the existing `verify-refresh-outbox.ts` has that shape, and it
 * is why L00 exists. So everything here hands out *separate* connections and
 * never wraps a test in one outer transaction.
 *
 * `sandboxAvailable()` is how the integration tests stay out of CI's way:
 * they skip when no disposable Postgres is reachable, rather than failing a
 * machine that was never set up for them. That is a deliberate trade — it
 * means a green CI run is not evidence these tests passed. The run log under
 * `docs/capacity/runs/` is.
 */

export function sandboxDatabaseUri(): string {
  const settings = sandboxSettings()
  assertPreflight(settings)
  return settings.databaseUri
}

/** The maintenance URI (`/postgres`) for create/drop of the sandbox database. */
export function maintenanceUri(): string {
  const url = new URL(sandboxDatabaseUri())
  url.pathname = '/postgres'
  return url.toString()
}

export function sandboxDatabaseName(): string {
  return new URL(sandboxDatabaseUri()).pathname.replace(/^\//, '')
}

let availability: boolean | null = null

/** Is the disposable database reachable? Cached: tests ask this a lot. */
export async function sandboxAvailable(): Promise<boolean> {
  if (availability !== null) return availability
  const client = new Client({ connectionString: sandboxDatabaseUri(), connectionTimeoutMillis: 2_000 })
  try {
    await client.connect()
    await client.end()
    availability = true
  } catch {
    availability = false
  }
  return availability
}

export async function createSandboxDatabase(): Promise<void> {
  const name = sandboxDatabaseName()
  const admin = new Client({ connectionString: maintenanceUri() })
  await admin.connect()
  try {
    // Identifiers cannot be parameterised. `name` came through preflight's
    // allowlist, so it is one of three literal strings.
    await admin.query(`CREATE DATABASE "${name}"`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('already exists')) throw error
  } finally {
    await admin.end()
  }
}

export async function dropSandboxDatabase(): Promise<void> {
  const name = sandboxDatabaseName()
  const admin = new Client({ connectionString: maintenanceUri() })
  await admin.connect()
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    )
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`)
  } finally {
    await admin.end()
  }
}

/**
 * A pool shaped like the one the worker is handed in production: `query` with
 * positional parameters, nothing else. Callers close it.
 */
export function sandboxPool(max = 4): Pool {
  return new Pool({ connectionString: sandboxDatabaseUri(), max })
}

/**
 * One dedicated connection, so a test can hold a transaction open on it while
 * another connection looks at the same rows. This is the whole point of the
 * harness: two connections, or the concurrency claim is not being tested.
 */
export async function sandboxClient(): Promise<Client> {
  const client = new Client({ connectionString: sandboxDatabaseUri() })
  await client.connect()
  return client
}

/**
 * The refresh-outbox table, standalone.
 *
 * The readiness tests need `refresh_jobs` and nothing else, and building it
 * directly rather than running Payload's whole migration chain keeps the
 * sandbox setup to under a second and keeps these tests independent of
 * schema churn elsewhere. The columns and the enum match
 * `features/refresh-outbox/collection.ts`; `schema.test.ts` is what keeps
 * that claim honest when the collection changes.
 */
export const REFRESH_JOBS_DDL = `
  DO $$ BEGIN
    CREATE TYPE enum_refresh_jobs_status AS ENUM ('pending', 'running', 'done', 'failed');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE TABLE IF NOT EXISTS refresh_jobs (
    id serial PRIMARY KEY,
    kind varchar NOT NULL,
    dedupe_key varchar NOT NULL UNIQUE,
    target jsonb NOT NULL,
    reason varchar,
    status enum_refresh_jobs_status NOT NULL DEFAULT 'pending',
    attempts numeric NOT NULL DEFAULT 0,
    generation numeric NOT NULL DEFAULT 1,
    claim_token varchar,
    claimed_generation numeric,
    next_attempt_at timestamp(3) with time zone NOT NULL DEFAULT now(),
    locked_until timestamp(3) with time zone,
    last_error varchar,
    completed_at timestamp(3) with time zone,
    updated_at timestamp(3) with time zone NOT NULL DEFAULT now(),
    created_at timestamp(3) with time zone NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS refresh_jobs_status_idx ON refresh_jobs (status);
  CREATE INDEX IF NOT EXISTS refresh_jobs_next_attempt_at_idx ON refresh_jobs (next_attempt_at);
`

export async function resetRefreshJobs(pool: Pool): Promise<void> {
  await pool.query(REFRESH_JOBS_DDL)
  await pool.query('TRUNCATE refresh_jobs RESTART IDENTITY')
}
