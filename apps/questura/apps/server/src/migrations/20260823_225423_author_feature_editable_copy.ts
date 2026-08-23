import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload: _payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_location_homepages_blocks_author_feature_description_mode" AS ENUM('profile', 'custom');
  CREATE TYPE "public"."enum_location_homepages_blocks_author_feature_expertise_mode" AS ENUM('profile', 'selected');
  CREATE TABLE "location_homepages_blocks_author_feature_selected_expertise" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "area" varchar NOT NULL
  );

  ALTER TABLE "location_homepages_blocks_author_feature" ADD COLUMN "description_mode" "enum_location_homepages_blocks_author_feature_description_mode" DEFAULT 'profile';
  ALTER TABLE "location_homepages_blocks_author_feature" ADD COLUMN "expertise_mode" "enum_location_homepages_blocks_author_feature_expertise_mode" DEFAULT 'profile';
  ALTER TABLE "location_homepages_blocks_author_feature_selected_expertise" ADD CONSTRAINT "location_homepages_blocks_author_feature_selected_expertise_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."location_homepages_blocks_author_feature"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "location_homepages_blocks_author_feature_selected_expertise_order_idx" ON "location_homepages_blocks_author_feature_selected_expertise" USING btree ("_order");
  CREATE INDEX "location_homepages_blocks_author_feature_selected_expertise_parent_id_idx" ON "location_homepages_blocks_author_feature_selected_expertise" USING btree ("_parent_id");`)
}

export async function down({ db, payload: _payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "location_homepages_blocks_author_feature_selected_expertise" CASCADE;
  ALTER TABLE "location_homepages_blocks_author_feature" DROP COLUMN "description_mode";
  ALTER TABLE "location_homepages_blocks_author_feature" DROP COLUMN "expertise_mode";
  DROP TYPE "public"."enum_location_homepages_blocks_author_feature_description_mode";
  DROP TYPE "public"."enum_location_homepages_blocks_author_feature_expertise_mode";`)
}
