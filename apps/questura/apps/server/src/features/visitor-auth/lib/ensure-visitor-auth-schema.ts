import { Pool } from 'pg'

import { APP_CONFIG } from '@/shared/config'

/**
 * Better Auth owns the `visitor_auth_*` tables; Payload does not.
 * Because the server runs the Postgres adapter in `push` mode, Payload drops
 * any table it does not recognise on boot — which silently wipes Better Auth's
 * tables and makes every sign-in/sign-up fail with a 500.
 *
 * This guard re-creates the tables after Payload has finished its schema push
 * (called from `onInit`). It is idempotent (`CREATE TABLE IF NOT EXISTS`) and
 * never drops or alters existing data. The DDL mirrors the committed migration
 * `src/migrations/20260529000000_better_auth_visitor_tables.ts`.
 */
export async function ensureVisitorAuthSchema(): Promise<void> {
  if (!APP_CONFIG.database.uri) {
    throw new Error('DATABASE_URI is required to ensure the visitor auth schema')
  }

  const pool = new Pool({
    connectionString: APP_CONFIG.database.uri,
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
  })

  try {
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
