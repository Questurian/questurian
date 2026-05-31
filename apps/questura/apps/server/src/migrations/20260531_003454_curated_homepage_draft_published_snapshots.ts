import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "location_homepages"
      ADD COLUMN IF NOT EXISTS "last_published_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "last_published_by_id" integer,
      ADD COLUMN IF NOT EXISTS "published_revision" numeric DEFAULT 0;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'location_homepages_last_published_by_id_users_id_fk'
      ) THEN
        ALTER TABLE "location_homepages"
          ADD CONSTRAINT "location_homepages_last_published_by_id_users_id_fk"
          FOREIGN KEY ("last_published_by_id")
          REFERENCES "public"."users"("id")
          ON DELETE set null
          ON UPDATE no action;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS "location_homepages_last_published_by_idx"
      ON "location_homepages" USING btree ("last_published_by_id");
  `)

  // Legacy `pageBlocks` stay in place. Runtime readers fall back to them until
  // each homepage is saved/published into the new draft/published fields.
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "location_homepages_last_published_by_idx";

    ALTER TABLE "location_homepages"
      DROP CONSTRAINT IF EXISTS "location_homepages_last_published_by_id_users_id_fk";

    ALTER TABLE "location_homepages"
      DROP COLUMN IF EXISTS "last_published_at",
      DROP COLUMN IF EXISTS "last_published_by_id",
      DROP COLUMN IF EXISTS "published_revision";
  `)
}
