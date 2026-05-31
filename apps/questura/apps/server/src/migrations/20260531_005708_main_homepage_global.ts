import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "main_homepage" (
      "id" serial PRIMARY KEY NOT NULL,
      "draft_page_blocks" jsonb DEFAULT '[]'::jsonb,
      "published_page_blocks" jsonb DEFAULT '[]'::jsonb,
      "last_published_at" timestamp(3) with time zone,
      "last_published_by_id" integer,
      "published_revision" numeric DEFAULT 0,
      "updated_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone
    );

    DO $$ BEGIN
      ALTER TABLE "main_homepage"
        ADD CONSTRAINT "main_homepage_last_published_by_id_users_id_fk"
        FOREIGN KEY ("last_published_by_id")
        REFERENCES "public"."users"("id")
        ON DELETE set null
        ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "main_homepage_last_published_by_idx"
      ON "main_homepage" USING btree ("last_published_by_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "main_homepage" CASCADE;
  `)
}
