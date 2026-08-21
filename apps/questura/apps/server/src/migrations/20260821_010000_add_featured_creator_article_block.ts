import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "location_homepages_blocks_featured_creator_article" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "slot_count" numeric DEFAULT 1 NOT NULL,
      "block_name" varchar,
      "section_heading" varchar,
      "section_subheading" varchar,
      "source_block_key" varchar
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'location_homepages_blocks_featured_creator_article_parent_id_fk'
      ) THEN
        ALTER TABLE "location_homepages_blocks_featured_creator_article"
          ADD CONSTRAINT "location_homepages_blocks_featured_creator_article_parent_id_fk"
          FOREIGN KEY ("_parent_id")
          REFERENCES "public"."location_homepages"("id")
          ON DELETE cascade
          ON UPDATE no action;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS "location_homepages_blocks_featured_creator_article_order_idx"
      ON "location_homepages_blocks_featured_creator_article" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "location_homepages_blocks_featured_creator_article_parent_id_idx"
      ON "location_homepages_blocks_featured_creator_article" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "location_homepages_blocks_featured_creator_article_path_idx"
      ON "location_homepages_blocks_featured_creator_article" USING btree ("_path");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "location_homepages_blocks_featured_creator_article";
  `)
}
