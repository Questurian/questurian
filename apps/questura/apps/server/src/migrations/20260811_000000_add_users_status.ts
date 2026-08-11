import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Staff account lifecycle (ADR-0007).
 *
 * Existing rows are all people who currently work here, so they backfill to
 * `active` via the column default. `NOT NULL` is deliberate: `isDisabledStaff`
 * treats an absent status as active, and a NULL column would make that
 * fallback load-bearing in production rather than a convenience for
 * hand-built test objects.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DO $$ BEGIN
        CREATE TYPE "public"."enum_users_status" AS ENUM('active', 'disabled');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `),
  )

  await db.execute(
    sql.raw(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "status" "public"."enum_users_status" DEFAULT 'active' NOT NULL;
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`ALTER TABLE "users" DROP COLUMN IF EXISTS "status";`))
  await db.execute(sql.raw(`DROP TYPE IF EXISTS "public"."enum_users_status";`))
}
