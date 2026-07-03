import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

const TOUR_KEY_LOCATION_SOURCE_ENUM = 'lit_tour_kl_source'
const TOUR_PRICE_TIER_ENUM = 'lit_tour_price_tier'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${TOUR_KEY_LOCATION_SOURCE_ENUM}') THEN
          CREATE TYPE "${TOUR_KEY_LOCATION_SOURCE_ENUM}" AS ENUM('existing', 'manual');
        END IF;
      END $$;

      -- Distinct dollar-quote tag: the '$$' enum values would terminate a plain $$ block.
      DO $price_tier$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${TOUR_PRICE_TIER_ENUM}') THEN
          CREATE TYPE "${TOUR_PRICE_TIER_ENUM}" AS ENUM('$', '$$', '$$$', '$$$$');
        END IF;
      END $price_tier$;

      CREATE TABLE IF NOT EXISTS "ita" (
        "_order" integer NOT NULL,
        "_parent_id" integer NOT NULL,
        "_path" text NOT NULL,
        "id" varchar PRIMARY KEY NOT NULL,
        "title" varchar,
        "operator" varchar,
        "price" "${TOUR_PRICE_TIER_ENUM}",
        "url" varchar,
        "tour_duration" numeric DEFAULT 1,
        "starting_point_label" varchar,
        "starting_point_latitude" numeric,
        "starting_point_longitude" numeric,
        "image_id" integer,
        "instagram_post_id" integer,
        "blurb" jsonb,
        "block_name" varchar
      );

      CREATE TABLE IF NOT EXISTS "kls" (
        "_order" integer NOT NULL,
        "_parent_id" varchar NOT NULL,
        "id" varchar PRIMARY KEY NOT NULL,
        "source" "${TOUR_KEY_LOCATION_SOURCE_ENUM}" DEFAULT 'existing',
        "title" varchar,
        "latitude" numeric,
        "longitude" numeric
      );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_schema = 'public'
            AND constraint_name = 'ita_parent_id_fk'
        ) THEN
          ALTER TABLE "ita"
            ADD CONSTRAINT "ita_parent_id_fk"
            FOREIGN KEY ("_parent_id") REFERENCES "public"."listicle_itineraries"("id")
            ON DELETE cascade ON UPDATE no action;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_schema = 'public'
            AND constraint_name = 'ita_image_id_media_assets_id_fk'
        ) THEN
          ALTER TABLE "ita"
            ADD CONSTRAINT "ita_image_id_media_assets_id_fk"
            FOREIGN KEY ("image_id") REFERENCES "public"."media_assets"("id")
            ON DELETE set null ON UPDATE no action;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_schema = 'public'
            AND constraint_name = 'ita_instagram_post_id_instagram_posts_id_fk'
        ) THEN
          ALTER TABLE "ita"
            ADD CONSTRAINT "ita_instagram_post_id_instagram_posts_id_fk"
            FOREIGN KEY ("instagram_post_id") REFERENCES "public"."instagram_posts"("id")
            ON DELETE set null ON UPDATE no action;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_schema = 'public'
            AND constraint_name = 'kls_parent_id_fk'
        ) THEN
          ALTER TABLE "kls"
            ADD CONSTRAINT "kls_parent_id_fk"
            FOREIGN KEY ("_parent_id") REFERENCES "public"."ita"("id")
            ON DELETE cascade ON UPDATE no action;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS "ita_order_idx" ON "ita" USING btree ("_order");
      CREATE INDEX IF NOT EXISTS "ita_parent_id_idx" ON "ita" USING btree ("_parent_id");
      CREATE INDEX IF NOT EXISTS "ita_path_idx" ON "ita" USING btree ("_path");
      CREATE INDEX IF NOT EXISTS "ita_image_idx" ON "ita" USING btree ("image_id");
      CREATE INDEX IF NOT EXISTS "ita_instagram_post_idx" ON "ita" USING btree ("instagram_post_id");
      CREATE INDEX IF NOT EXISTS "kls_order_idx" ON "kls" USING btree ("_order");
      CREATE INDEX IF NOT EXISTS "kls_parent_id_idx" ON "kls" USING btree ("_parent_id");
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DROP TABLE IF EXISTS "kls" CASCADE;
      DROP TABLE IF EXISTS "ita" CASCADE;
      DROP TYPE IF EXISTS "${TOUR_KEY_LOCATION_SOURCE_ENUM}";
      DROP TYPE IF EXISTS "${TOUR_PRICE_TIER_ENUM}";
    `),
  )
}
