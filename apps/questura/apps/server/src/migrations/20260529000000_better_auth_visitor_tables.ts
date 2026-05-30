import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
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

  await db.execute(sql`
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

  await db.execute(sql`
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

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "visitor_auth_verifications" (
      "id" text NOT NULL PRIMARY KEY,
      "identifier" text NOT NULL,
      "value" text NOT NULL,
      "expiresAt" timestamptz NOT NULL,
      "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "visitor_auth_rate_limits" (
      "id" text NOT NULL PRIMARY KEY,
      "key" text NOT NULL UNIQUE,
      "count" integer NOT NULL,
      "lastRequest" bigint NOT NULL
    );
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "visitor_auth_sessions_userId_idx"
    ON "visitor_auth_sessions" ("userId");
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "visitor_auth_accounts_userId_idx"
    ON "visitor_auth_accounts" ("userId");
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "visitor_auth_verifications_identifier_idx"
    ON "visitor_auth_verifications" ("identifier");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "visitor_auth_verifications_identifier_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "visitor_auth_accounts_userId_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "visitor_auth_sessions_userId_idx";`)
  await db.execute(sql`DROP TABLE IF EXISTS "visitor_auth_rate_limits";`)
  await db.execute(sql`DROP TABLE IF EXISTS "visitor_auth_verifications";`)
  await db.execute(sql`DROP TABLE IF EXISTS "visitor_auth_accounts";`)
  await db.execute(sql`DROP TABLE IF EXISTS "visitor_auth_sessions";`)
  await db.execute(sql`DROP TABLE IF EXISTS "visitor_auth_users";`)
}
