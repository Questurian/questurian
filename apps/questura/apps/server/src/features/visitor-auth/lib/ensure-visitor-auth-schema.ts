import { Pool } from 'pg'

import { APP_CONFIG } from '@/shared/config'

/**
 * Better Auth owns the `visitor_auth_*` tables; Payload does not.
 * Keep this idempotent guard for fresh or partially migrated databases. It also
 * repairs databases previously booted with Payload's `push` mode, which can
 * drop tables that Payload does not recognise.
 *
 * This guard re-creates the tables after Payload has initialized (called from
 * `onInit`). The DDL is idempotent (`CREATE TABLE IF NOT EXISTS`)
 * and mirrors the committed migration
 * `src/migrations/20260529000000_better_auth_visitor_tables.ts`.
 *
 * After ensuring the schema, it *reports* orphaned `visitor_profiles` rows
 * (profiles whose `auth_user_id` no longer maps to a `visitor_auth_users` row),
 * which can arise because the auth tables above were dropped and recreated
 * empty while the Payload-owned profile table persisted.
 *
 * This function never writes to `visitor_profiles` and never alters the auth
 * tables' data. See the sweep block below for why reporting replaced deletion.
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

    // Report — never delete — orphaned visitor profiles.
    //
    // This block used to `DELETE` these rows on every boot, justified as keeping
    // the sign-in email-existence check consistent with the auth source of
    // truth. That justification does not hold: the account check
    // (`findVisitorAccountByEmail`) resolves entirely against Better Auth's
    // `visitor_auth_users` and never reads `visitor_profiles`. Orphans are inert
    // — `authUserId` is unique and lookups are keyed on it, so a stale row can
    // never be matched by a live session, and `email` is not unique, so it
    // cannot collide with a re-registered visitor's new profile.
    //
    // The rows, however, are not cheap: `visitor_profiles` holds the Stripe
    // linkage (`stripe_customer_id`, `stripe_subscription_id`,
    // `membership_expiration`). Deleting them on boot means a restore-ordering
    // mistake, a lagging replica, or a wrong `DATABASE_URI` silently destroys
    // billing linkage with no FK, no soft-delete, no audit and no row-count
    // guard. Reporting keeps the diagnostic without the loss; reconciliation is
    // a deliberate, reviewable operation, not a boot side effect.
    const { rows: profileTableRows } = await pool.query<{ present: boolean }>(`
      SELECT to_regclass('public.visitor_profiles') IS NOT NULL AS present;
    `)

    if (profileTableRows[0]?.present) {
      const { rows: orphanRows } = await pool.query<{
        orphan_count: string
        sample_ids: string[] | null
      }>(`
        SELECT
          COUNT(*)::text AS orphan_count,
          (ARRAY_AGG(vp."id"::text ORDER BY vp."id"))[1:20] AS sample_ids
        FROM "visitor_profiles" vp
        WHERE vp."auth_user_id" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "visitor_auth_users" u WHERE u."id" = vp."auth_user_id"
          );
      `)

      const orphanCount = Number(orphanRows[0]?.orphan_count ?? '0')

      if (orphanCount > 0) {
        console.warn(
          `[visitor-auth] ${orphanCount} orphaned visitor_profiles row(s) detected ` +
            `(auth_user_id with no matching visitor_auth_users row). These rows are ` +
            `retained: they may carry Stripe billing linkage. Sample ids: ` +
            `${(orphanRows[0]?.sample_ids ?? []).join(', ')}`
        )
      }
    }
  } finally {
    await pool.end()
  }
}
