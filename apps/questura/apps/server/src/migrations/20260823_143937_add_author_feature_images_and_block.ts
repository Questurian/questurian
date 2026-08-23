import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_location_homepages_blocks_author_feature_image_style" AS ENUM('circle', 'square', 'portrait', 'mixed');
  CREATE TYPE "public"."enum_location_homepages_blocks_author_feature_motion_style" AS ENUM('none', 'subtle');
  CREATE TABLE "authors_author_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_set_id" integer NOT NULL
  );
  
  CREATE TABLE "location_homepages_blocks_author_feature_author_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"author_id" integer NOT NULL,
  	"image_id" integer,
  	"spotlight_note" varchar,
  	"is_emphasized" boolean DEFAULT false
  );
  
  CREATE TABLE "location_homepages_blocks_author_feature" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"slot_count" numeric NOT NULL,
  	"section_heading" varchar,
  	"section_subheading" varchar,
  	"image_style" "enum_location_homepages_blocks_author_feature_image_style" DEFAULT 'mixed',
  	"motion_style" "enum_location_homepages_blocks_author_feature_motion_style" DEFAULT 'subtle',
  	"source_block_key" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "authors_author_images" ADD CONSTRAINT "authors_author_images_media_set_id_media_sets_id_fk" FOREIGN KEY ("media_set_id") REFERENCES "public"."media_sets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors_author_images" ADD CONSTRAINT "authors_author_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "location_homepages_blocks_author_feature_author_cards" ADD CONSTRAINT "location_homepages_blocks_author_feature_author_cards_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "location_homepages_blocks_author_feature_author_cards" ADD CONSTRAINT "location_homepages_blocks_author_feature_author_cards_image_id_media_sets_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media_sets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "location_homepages_blocks_author_feature_author_cards" ADD CONSTRAINT "location_homepages_blocks_author_feature_author_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."location_homepages_blocks_author_feature"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "location_homepages_blocks_author_feature" ADD CONSTRAINT "location_homepages_blocks_author_feature_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."location_homepages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "authors_author_images_order_idx" ON "authors_author_images" USING btree ("_order");
  CREATE INDEX "authors_author_images_parent_id_idx" ON "authors_author_images" USING btree ("_parent_id");
  CREATE INDEX "authors_author_images_media_set_idx" ON "authors_author_images" USING btree ("media_set_id");
  CREATE INDEX "location_homepages_blocks_author_feature_author_cards_order_idx" ON "location_homepages_blocks_author_feature_author_cards" USING btree ("_order");
  CREATE INDEX "location_homepages_blocks_author_feature_author_cards_parent_id_idx" ON "location_homepages_blocks_author_feature_author_cards" USING btree ("_parent_id");
  CREATE INDEX "location_homepages_blocks_author_feature_author_cards_au_idx" ON "location_homepages_blocks_author_feature_author_cards" USING btree ("author_id");
  CREATE INDEX "location_homepages_blocks_author_feature_author_cards_im_idx" ON "location_homepages_blocks_author_feature_author_cards" USING btree ("image_id");
  CREATE INDEX "location_homepages_blocks_author_feature_order_idx" ON "location_homepages_blocks_author_feature" USING btree ("_order");
  CREATE INDEX "location_homepages_blocks_author_feature_parent_id_idx" ON "location_homepages_blocks_author_feature" USING btree ("_parent_id");
  CREATE INDEX "location_homepages_blocks_author_feature_path_idx" ON "location_homepages_blocks_author_feature" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "authors_author_images" CASCADE;
  DROP TABLE "location_homepages_blocks_author_feature_author_cards" CASCADE;
  DROP TABLE "location_homepages_blocks_author_feature" CASCADE;
  DROP TYPE "public"."enum_location_homepages_blocks_author_feature_image_style";
  DROP TYPE "public"."enum_location_homepages_blocks_author_feature_motion_style";`)
}
