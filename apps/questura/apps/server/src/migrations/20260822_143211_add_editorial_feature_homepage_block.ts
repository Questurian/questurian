import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "location_homepages_blocks_editorial_feature" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "slot_count" numeric NOT NULL,
    "feature_kicker" varchar,
    "feature_title" varchar,
    "feature_description" varchar,
    "feature_media_set_id" integer,
    "linked_location_id" integer,
    "source_block_key" varchar,
    "block_name" varchar
  );

  ALTER TABLE "location_homepages_blocks_editorial_feature" ADD CONSTRAINT "location_homepages_blocks_editorial_feature_feature_media_set_id_media_sets_id_fk" FOREIGN KEY ("feature_media_set_id") REFERENCES "public"."media_sets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "location_homepages_blocks_editorial_feature" ADD CONSTRAINT "location_homepages_blocks_editorial_feature_linked_location_id_locations_id_fk" FOREIGN KEY ("linked_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "location_homepages_blocks_editorial_feature" ADD CONSTRAINT "location_homepages_blocks_editorial_feature_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."location_homepages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "location_homepages_blocks_editorial_feature_order_idx" ON "location_homepages_blocks_editorial_feature" USING btree ("_order");
  CREATE INDEX "location_homepages_blocks_editorial_feature_parent_id_idx" ON "location_homepages_blocks_editorial_feature" USING btree ("_parent_id");
  CREATE INDEX "location_homepages_blocks_editorial_feature_path_idx" ON "location_homepages_blocks_editorial_feature" USING btree ("_path");
  CREATE INDEX "location_homepages_blocks_editorial_feature_feature_medi_idx" ON "location_homepages_blocks_editorial_feature" USING btree ("feature_media_set_id");
  CREATE INDEX "location_homepages_blocks_editorial_feature_linked_locat_idx" ON "location_homepages_blocks_editorial_feature" USING btree ("linked_location_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "location_homepages_blocks_editorial_feature" CASCADE;`)
}
