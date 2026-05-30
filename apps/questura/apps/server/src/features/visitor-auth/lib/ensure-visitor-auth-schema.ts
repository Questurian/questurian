import { Pool } from 'pg'

import { APP_CONFIG } from '@/shared/config'

/**
 * Better Auth owns the `visitor_auth_*` tables; Payload does not.
 * Because the server runs the Postgres adapter in `push` mode, Payload drops
 * any table it does not recognise on boot — which silently wipes Better Auth's
 * tables and makes every sign-in/sign-up fail with a 500.
 *
 * This guard re-creates the tables after Payload has finished its schema push
 * (called from `onInit`). The DDL is idempotent (`CREATE TABLE IF NOT EXISTS`)
 * and mirrors the committed migration
 * `src/migrations/20260529000000_better_auth_visitor_tables.ts`.
 *
 * After ensuring the schema, it also removes orphaned `visitor_profiles` rows
 * (profiles whose `auth_user_id` no longer maps to a `visitor_auth_users` row),
 * which can arise precisely because the auth tables above were dropped and
 * recreated empty while the Payload-owned profile table persisted. It never
 * alters the auth tables' data.
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

    // Sweep orphaned visitor profiles. `visitor_profiles` is Payload-owned and
    // survives across boots, whereas the Better Auth `visitor_auth_*` tables can
    // be dropped/recreated empty by Payload's push mode (see comment above). A
    // profile is only ever created *after* its auth user exists, so any profile
    // whose `auth_user_id` no longer maps to a `visitor_auth_users` row is a
    // dangling record that breaks the sign-in account check. Remove them so the
    // email-existence check stays consistent with the auth source of truth.
    await pool.query(`
      DO $$
      BEGIN
        IF to_regclass('public.visitor_profiles') IS NOT NULL THEN
          DELETE FROM "visitor_profiles" vp
          WHERE vp."auth_user_id" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM "visitor_auth_users" u WHERE u."id" = vp."auth_user_id"
            );
        END IF;
      END $$;
    `)
  } finally {
    await pool.end()
  }
}
