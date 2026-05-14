import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE
      locations_count bigint;
      guide_cover_image_count bigint := 0;
    BEGIN
      SELECT count(*) INTO locations_count FROM "locations";

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'locations'
          AND column_name = 'guide_media_cover_image_id'
      ) THEN
        SELECT count(*) INTO guide_cover_image_count
        FROM "locations"
        WHERE "guide_media_cover_image_id" IS NOT NULL;
      END IF;

      RAISE NOTICE
        'locations before cover image promotion: %, guide_media_cover_image_id non-null: %',
        locations_count,
        guide_cover_image_count;
    END $$;
  `)

  await db.execute(sql`
    ALTER TABLE "locations"
    ADD COLUMN IF NOT EXISTS "cover_image_id" integer;
  `)

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'locations'::regclass
          AND conname = 'locations_cover_image_id_media_sets_id_fk'
      ) THEN
        ALTER TABLE "locations"
        ADD CONSTRAINT "locations_cover_image_id_media_sets_id_fk"
        FOREIGN KEY ("cover_image_id")
        REFERENCES "media_sets" ("id")
        ON DELETE SET NULL;
      END IF;
    END $$;
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "locations_cover_image_idx"
    ON "locations" ("cover_image_id");
  `)

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'locations'
          AND column_name = 'guide_media_cover_image_id'
      ) THEN
        UPDATE "locations"
        SET "cover_image_id" = "guide_media_cover_image_id"
        WHERE "guide_media_cover_image_id" IS NOT NULL
          AND "cover_image_id" IS NULL;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "locations_cover_image_idx";
  `)

  await db.execute(sql`
    ALTER TABLE "locations"
    DROP CONSTRAINT IF EXISTS "locations_cover_image_id_media_sets_id_fk";
  `)

  await db.execute(sql`
    ALTER TABLE "locations"
    DROP COLUMN IF EXISTS "cover_image_id";
  `)
}
