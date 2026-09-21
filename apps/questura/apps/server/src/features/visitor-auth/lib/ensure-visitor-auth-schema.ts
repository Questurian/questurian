import { Pool } from 'pg'

import { poolSizes } from '@/shared/database/pool-budget'

import { APP_CONFIG } from '@/shared/config'

/**
 * Better Auth owns the `visitor_auth_*` tables; Payload does not.
 * Keep this idempotent guard for fresh or partially migrated databases. It also
 * repairs databases previously booted with Payload's `push` mode, which can
 * drop tables that Payload does not recognise.
 *
 * The DDL is idempotent (`CREATE TABLE IF NOT EXISTS`) and mirrors the
 * committed migration `src/migrations/20260529000000_better_auth_visitor_tables.ts`.
 *
 * What runs at boot depends on where
 * ---------------------------------
 * Outside production this creates the tables, because a developer's database
 * is frequently reset and the guard is what makes `pnpm dev` work on a fresh
 * one.
 *
 * In production it only *checks* them. Schema changes belong in reviewed
 * migrations, and a process that issues DDL every time it starts is a
 * different thing on a long-lived server than on one that sleeps: a serverless
 * or suspend-and-resume deployment repeats every check and every scan on every
 * cold start, in front of the reader who woke it. The check is five
 * `to_regclass` lookups in one statement, and a missing table fails the boot
 * loudly instead of being papered over — the missing migration is the bug, and
 * creating the table at boot is what hides it.
 *
 * `VISITOR_AUTH_SCHEMA_GUARD=create` forces the DDL anywhere, for the one case
 * that justified it in production: a database restored without the Better Auth
 * tables, where the operator has decided the guard is the fastest way back.
 *
 * The orphan audit is no longer part of boot at all. It scans
 * `visitor_profiles` — the table holding Stripe linkage and paid entitlement —
 * and it is a diagnostic, not a precondition for serving. It moved to
 * `pnpm audit:visitor-auth-orphans`, which reports and never deletes; see
 * `scripts/audit-visitor-auth-orphans.ts` for why reporting replaced deletion.
 */

export type VisitorAuthSchemaMode = 'create' | 'validate'

const REQUIRED_TABLES = [
  'visitor_auth_users',
  'visitor_auth_sessions',
  'visitor_auth_accounts',
  'visitor_auth_verifications',
  'visitor_auth_rate_limits',
] as const

export function visitorAuthSchemaMode(): VisitorAuthSchemaMode {
  const configured = process.env.VISITOR_AUTH_SCHEMA_GUARD?.trim().toLowerCase()
  if (configured === 'create' || configured === 'validate') return configured

  return APP_CONFIG.isProduction ? 'validate' : 'create'
}

/**
 * One statement, five `to_regclass` lookups: is every table Better Auth needs
 * actually there?
 */
export async function assertVisitorAuthSchema(pool: {
  query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>
}): Promise<void> {
  const { rows } = await pool.query(`
    SELECT
      ${REQUIRED_TABLES.map(
        (table) => `to_regclass('public.${table}') IS NOT NULL AS "${table}"`,
      ).join(',\n      ')};
  `)

  const present = rows[0] ?? {}
  const missing = REQUIRED_TABLES.filter((table) => present[table] !== true)

  if (missing.length > 0) {
    throw new Error(
      `Visitor auth tables are missing: ${missing.join(', ')}. ` +
        'Run the committed migrations (pnpm db:migrate) rather than creating them at boot.',
    )
  }
}

export async function ensureVisitorAuthSchema(): Promise<void> {
  if (!APP_CONFIG.database.uri) {
    throw new Error('DATABASE_URI is required to ensure the visitor auth schema')
  }

  const pool = new Pool({
    connectionString: APP_CONFIG.database.uri,
    max: poolSizes().startup,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
  })

  try {
    if (visitorAuthSchemaMode() === 'validate') {
      await assertVisitorAuthSchema(pool)
      return
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "visitor_auth_users" (
        "id" text NOT NULL PRIMARY KEY,
        "name" text NOT NULL,
        "email" text NOT NULL UNIQUE,
        "emailVerified" boolean NOT NULL,
        "image" text,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "visitor_auth_sessions" (
        "id" text NOT NULL PRIMARY KEY,
        "expiresAt" timestamptz NOT NULL,
        "token" text NOT NULL UNIQUE,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        "ipAddress" text,
        "userAgent" text,
        "userId" text NOT NULL REFERENCES "visitor_auth_users" ("id") ON DELETE CASCADE
      );
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "visitor_auth_accounts" (
        "id" text NOT NULL PRIMARY KEY,
        "accountId" text NOT NULL,
        "providerId" text NOT NULL,
        "userId" text NOT NULL REFERENCES "visitor_auth_users" ("id") ON DELETE CASCADE,
        "accessToken" text,
        "refreshToken" text,
        "idToken" text,
        "accessTokenExpiresAt" timestamptz,
        "refreshTokenExpiresAt" timestamptz,
        "scope" text,
        "password" text,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz NOT NULL
      );
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "visitor_auth_verifications" (
        "id" text NOT NULL PRIMARY KEY,
        "identifier" text NOT NULL,
        "value" text NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "visitor_auth_rate_limits" (
        "id" text NOT NULL PRIMARY KEY,
        "key" text NOT NULL UNIQUE,
        "count" integer NOT NULL,
        "lastRequest" bigint NOT NULL
      );
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS "visitor_auth_sessions_userId_idx"
      ON "visitor_auth_sessions" ("userId");
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS "visitor_auth_accounts_userId_idx"
      ON "visitor_auth_accounts" ("userId");
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS "visitor_auth_verifications_identifier_idx"
      ON "visitor_auth_verifications" ("identifier");
    `)

  } finally {
    await pool.end()
  }
}
