import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE
      locations_count_before bigint;
      copied_cover_image_mismatches bigint := 0;
      unexpected_location_rels bigint := 0;
    BEGIN
      SELECT count(*) INTO locations_count_before FROM "locations";

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'locations'
          AND column_name = 'guide_media_cover_image_id'
      ) THEN
        SELECT count(*) INTO copied_cover_image_mismatches
        FROM "locations"
        WHERE "guide_media_cover_image_id" IS NOT NULL
          AND "cover_image_id" IS DISTINCT FROM "guide_media_cover_image_id";

        IF copied_cover_image_mismatches > 0 THEN
          RAISE EXCEPTION
            'cover_image_id does not preserve guide_media_cover_image_id on % locations',
            copied_cover_image_mismatches;
        END IF;
      END IF;

      IF to_regclass('public.locations_rels') IS NOT NULL THEN
        SELECT count(*) INTO unexpected_location_rels
        FROM "locations_rels"
        WHERE "path" IS NULL
          OR "path" NOT IN (
            'guide.explore.highlights.relatedNeighborhoods',
            'guide.stay.highlights.relatedNeighborhoods',
            'guide.move.highlights.relatedNeighborhoods'
          );

        IF unexpected_location_rels > 0 THEN
          RAISE EXCEPTION
            'locations_rels contains % non-guide relatedNeighborhoods rows',
            unexpected_location_rels;
        END IF;
      END IF;

      RAISE NOTICE 'locations before guide cleanup: %', locations_count_before;
    END $$;
  `)

  await db.execute(sql`
    DROP TABLE IF EXISTS "locations_guide_core_health_safety_emergency_numbers" CASCADE;
  `)

  await db.execute(sql`
    DROP TABLE IF EXISTS "locations_guide_core_weather_monthly_stats" CASCADE;
  `)

  await db.execute(sql`
    DROP TABLE IF EXISTS "locations_guide_explore_highlights" CASCADE;
  `)

  await db.execute(sql`
    DROP TABLE IF EXISTS "locations_guide_stay_highlights" CASCADE;
  `)

  await db.execute(sql`
    DROP TABLE IF EXISTS "locations_guide_move_highlights" CASCADE;
  `)

  await db.execute(sql`
    DROP TABLE IF EXISTS "locations_rels" CASCADE;
  `)

  await db.execute(sql`
    DO $$
    DECLARE
      guide_column record;
    BEGIN
      FOR guide_column IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'locations'
          AND column_name LIKE 'guide\_%' ESCAPE '\'
      LOOP
        EXECUTE format(
          'ALTER TABLE %I.%I DROP COLUMN IF EXISTS %I CASCADE',
          'public',
          'locations',
          guide_column.column_name
        );
      END LOOP;
    END $$;
  `)

  await db.execute(sql`
    DO $$
    DECLARE
      locations_count_after bigint;
      remaining_guide_columns bigint;
      remaining_guide_tables bigint;
    BEGIN
      SELECT count(*) INTO locations_count_after FROM "locations";

      SELECT count(*) INTO remaining_guide_columns
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'locations'
        AND column_name LIKE 'guide\_%' ESCAPE '\';

      SELECT count(*) INTO remaining_guide_tables
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'locations\_guide\_%' ESCAPE '\';

      IF remaining_guide_columns > 0 THEN
        RAISE EXCEPTION 'locations still has % guide columns', remaining_guide_columns;
      END IF;

      IF remaining_guide_tables > 0 THEN
        RAISE EXCEPTION 'database still has % locations_guide_* tables', remaining_guide_tables;
      END IF;

      IF to_regclass('public.locations_rels') IS NOT NULL THEN
        RAISE EXCEPTION 'locations_rels still exists after guide cleanup';
      END IF;

      RAISE NOTICE 'locations after guide cleanup: %', locations_count_after;
    END $$;
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error('Guide storage cleanup is irreversible after guide columns are dropped.')
}
