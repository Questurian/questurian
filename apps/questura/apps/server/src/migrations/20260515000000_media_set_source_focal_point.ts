import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media_sets"
    ADD COLUMN IF NOT EXISTS "source_id" integer;
  `)

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'media_sets'::regclass
          AND conname = 'media_sets_source_id_media_assets_id_fk'
      ) THEN
        ALTER TABLE "media_sets"
        ADD CONSTRAINT "media_sets_source_id_media_assets_id_fk"
        FOREIGN KEY ("source_id")
        REFERENCES "media_assets" ("id")
        ON DELETE SET NULL;
      END IF;
    END $$;
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "media_sets_source_idx"
    ON "media_sets" ("source_id");
  `)

  await db.execute(sql`
    ALTER TABLE "media_sets"
    ADD COLUMN IF NOT EXISTS "focal_point_x" numeric DEFAULT 0.5 NOT NULL;
  `)

  await db.execute(sql`
    ALTER TABLE "media_sets"
    ADD COLUMN IF NOT EXISTS "focal_point_y" numeric DEFAULT 0.5 NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media_sets"
    DROP COLUMN IF EXISTS "focal_point_y";
  `)

  await db.execute(sql`
    ALTER TABLE "media_sets"
    DROP COLUMN IF EXISTS "focal_point_x";
  `)

  await db.execute(sql`
    DROP INDEX IF EXISTS "media_sets_source_idx";
  `)

  await db.execute(sql`
    ALTER TABLE "media_sets"
    DROP CONSTRAINT IF EXISTS "media_sets_source_id_media_assets_id_fk";
  `)

  await db.execute(sql`
    ALTER TABLE "media_sets"
    DROP COLUMN IF EXISTS "source_id";
  `)
}
