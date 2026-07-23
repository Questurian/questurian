import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."itinerary_moment" ADD VALUE 'morning-walk' BEFORE 'lunch';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'remote-work' BEFORE 'lunch';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'coworking-stop' BEFORE 'lunch';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'street-food' BEFORE 'sweet-treat';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'historic-site' BEFORE 'landmark';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'museum-visit' BEFORE 'landmark';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'guided-tour' BEFORE 'shopping';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'local-market' BEFORE 'shopping';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'beach-time' BEFORE 'sunset';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'scenic-viewpoint' BEFORE 'sunset';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'wellness-break' BEFORE 'sunset';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'active-adventure' BEFORE 'sunset';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'boat-ride' BEFORE 'sunset';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'day-trip' BEFORE 'sunset';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'in-transit' BEFORE 'sunset';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'rooftop-stop' BEFORE 'dinner';
  ALTER TYPE "public"."itinerary_moment" ADD VALUE 'cocktails' BEFORE 'drinks';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "listicle_itineraries_blocks_itinerary_dining" ALTER COLUMN "moment" SET DATA TYPE text;
  ALTER TABLE "listicle_itineraries_blocks_itinerary_accommodations" ALTER COLUMN "moment" SET DATA TYPE text;
  ALTER TABLE "listicle_itineraries_blocks_itinerary_attractions" ALTER COLUMN "moment" SET DATA TYPE text;
  ALTER TABLE "listicle_itineraries_blocks_itinerary_nightlife" ALTER COLUMN "moment" SET DATA TYPE text;
  ALTER TABLE "listicle_itineraries_blocks_itinerary_key_location" ALTER COLUMN "moment" SET DATA TYPE text;
  ALTER TABLE "ita" ALTER COLUMN "moment" SET DATA TYPE text;
  DROP TYPE "public"."itinerary_moment";
  CREATE TYPE "public"."itinerary_moment" AS ENUM('breakfast', 'coffee', 'lunch', 'sweet-treat', 'culture', 'landmark', 'shopping', 'outdoor', 'sunset', 'dinner', 'drinks', 'nightlife');
  ALTER TABLE "listicle_itineraries_blocks_itinerary_dining" ALTER COLUMN "moment" SET DATA TYPE "public"."itinerary_moment" USING "moment"::"public"."itinerary_moment";
  ALTER TABLE "listicle_itineraries_blocks_itinerary_accommodations" ALTER COLUMN "moment" SET DATA TYPE "public"."itinerary_moment" USING "moment"::"public"."itinerary_moment";
  ALTER TABLE "listicle_itineraries_blocks_itinerary_attractions" ALTER COLUMN "moment" SET DATA TYPE "public"."itinerary_moment" USING "moment"::"public"."itinerary_moment";
  ALTER TABLE "listicle_itineraries_blocks_itinerary_nightlife" ALTER COLUMN "moment" SET DATA TYPE "public"."itinerary_moment" USING "moment"::"public"."itinerary_moment";
  ALTER TABLE "listicle_itineraries_blocks_itinerary_key_location" ALTER COLUMN "moment" SET DATA TYPE "public"."itinerary_moment" USING "moment"::"public"."itinerary_moment";
  ALTER TABLE "ita" ALTER COLUMN "moment" SET DATA TYPE "public"."itinerary_moment" USING "moment"::"public"."itinerary_moment";`)
}
