import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'best-for-night';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'location-and-setting';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'view-and-vista';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'design-and-aesthetic';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'signature-amenity';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'food-and-beverage';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'trip-fit';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'property-backstory';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'booking-tip';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'signature-feature';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'setting';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'history-built';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'visit-time-tip';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" ADD VALUE 'best-for-visit-type';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'best-for-night';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'location-and-setting';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'view-and-vista';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'design-and-aesthetic';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'signature-amenity';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'food-and-beverage';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'trip-fit';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'property-backstory';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'booking-tip';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'signature-feature';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'setting';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'history-built';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'visit-time-tip';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" ADD VALUE 'best-for-visit-type';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'best-for-night';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'location-and-setting';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'view-and-vista';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'design-and-aesthetic';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'signature-amenity';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'food-and-beverage';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'trip-fit';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'property-backstory';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'booking-tip';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'signature-feature';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'setting';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'history-built';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'visit-time-tip';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" ADD VALUE 'best-for-visit-type';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'best-for-night';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'location-and-setting';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'view-and-vista';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'design-and-aesthetic';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'signature-amenity';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'food-and-beverage';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'trip-fit';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'property-backstory';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'booking-tip';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'signature-feature';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'setting';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'history-built';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'visit-time-tip';
  ALTER TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" ADD VALUE 'best-for-visit-type';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "single_type_listicles_blocks_data_dining" ALTER COLUMN "angle" SET DATA TYPE text;
  DROP TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle";
  CREATE TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" AS ENUM('signature-dish', 'atmosphere', 'founders-backstory', 'insider-tip', 'best-for', 'whats-different');
  ALTER TABLE "single_type_listicles_blocks_data_dining" ALTER COLUMN "angle" SET DATA TYPE "public"."enum_single_type_listicles_blocks_data_dining_angle" USING "angle"::"public"."enum_single_type_listicles_blocks_data_dining_angle";
  ALTER TABLE "single_type_listicles_blocks_data_accommodations" ALTER COLUMN "angle" SET DATA TYPE text;
  DROP TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle";
  CREATE TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" AS ENUM('signature-dish', 'atmosphere', 'founders-backstory', 'insider-tip', 'best-for', 'whats-different');
  ALTER TABLE "single_type_listicles_blocks_data_accommodations" ALTER COLUMN "angle" SET DATA TYPE "public"."enum_single_type_listicles_blocks_data_accommodations_angle" USING "angle"::"public"."enum_single_type_listicles_blocks_data_accommodations_angle";
  ALTER TABLE "single_type_listicles_blocks_data_attractions" ALTER COLUMN "angle" SET DATA TYPE text;
  DROP TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle";
  CREATE TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" AS ENUM('signature-dish', 'atmosphere', 'founders-backstory', 'insider-tip', 'best-for', 'whats-different');
  ALTER TABLE "single_type_listicles_blocks_data_attractions" ALTER COLUMN "angle" SET DATA TYPE "public"."enum_single_type_listicles_blocks_data_attractions_angle" USING "angle"::"public"."enum_single_type_listicles_blocks_data_attractions_angle";
  ALTER TABLE "single_type_listicles_blocks_data_nightlife" ALTER COLUMN "angle" SET DATA TYPE text;
  DROP TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle";
  CREATE TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" AS ENUM('signature-dish', 'atmosphere', 'founders-backstory', 'insider-tip', 'best-for', 'whats-different');
  ALTER TABLE "single_type_listicles_blocks_data_nightlife" ALTER COLUMN "angle" SET DATA TYPE "public"."enum_single_type_listicles_blocks_data_nightlife_angle" USING "angle"::"public"."enum_single_type_listicles_blocks_data_nightlife_angle";`)
}
