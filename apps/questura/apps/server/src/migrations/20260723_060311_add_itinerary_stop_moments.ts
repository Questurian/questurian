import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."itinerary_moment" AS ENUM(
      'breakfast',
      'coffee',
      'lunch',
      'sweet-treat',
      'culture',
      'landmark',
      'shopping',
      'outdoor',
      'sunset',
      'dinner',
      'drinks',
      'nightlife'
    );

    ALTER TABLE "listicle_itineraries_blocks_itinerary_dining"
      ADD COLUMN "moment" "itinerary_moment",
      ADD COLUMN "moment_label" varchar;

    ALTER TABLE "listicle_itineraries_blocks_itinerary_accommodations"
      ADD COLUMN "moment" "itinerary_moment",
      ADD COLUMN "moment_label" varchar;

    ALTER TABLE "listicle_itineraries_blocks_itinerary_attractions"
      ADD COLUMN "moment" "itinerary_moment",
      ADD COLUMN "moment_label" varchar;

    ALTER TABLE "listicle_itineraries_blocks_itinerary_nightlife"
      ADD COLUMN "moment" "itinerary_moment",
      ADD COLUMN "moment_label" varchar;

    ALTER TABLE "listicle_itineraries_blocks_itinerary_key_location"
      ADD COLUMN "moment" "itinerary_moment",
      ADD COLUMN "moment_label" varchar;

    ALTER TABLE "ita"
      ADD COLUMN "moment" "itinerary_moment",
      ADD COLUMN "moment_label" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "listicle_itineraries_blocks_itinerary_dining"
      DROP COLUMN "moment",
      DROP COLUMN "moment_label";

    ALTER TABLE "listicle_itineraries_blocks_itinerary_accommodations"
      DROP COLUMN "moment",
      DROP COLUMN "moment_label";

    ALTER TABLE "listicle_itineraries_blocks_itinerary_attractions"
      DROP COLUMN "moment",
      DROP COLUMN "moment_label";

    ALTER TABLE "listicle_itineraries_blocks_itinerary_nightlife"
      DROP COLUMN "moment",
      DROP COLUMN "moment_label";

    ALTER TABLE "listicle_itineraries_blocks_itinerary_key_location"
      DROP COLUMN "moment",
      DROP COLUMN "moment_label";

    ALTER TABLE "ita"
      DROP COLUMN "moment",
      DROP COLUMN "moment_label";

    DROP TYPE "public"."itinerary_moment";
  `)
}
