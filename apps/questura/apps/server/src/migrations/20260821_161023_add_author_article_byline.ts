import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_authors_article_byline_featured_links" AS ENUM(
      'instagram',
      'youtube',
      'website',
      'twitter',
      'facebook',
      'linkedin',
      'reddit',
      'patreon'
    );

    CREATE TABLE "authors_article_byline_featured_links" (
      "order" integer NOT NULL,
      "parent_id" integer NOT NULL,
      "value" "enum_authors_article_byline_featured_links",
      "id" serial PRIMARY KEY NOT NULL
    );

    ALTER TABLE "authors"
      ADD COLUMN "article_byline_show_avatar" boolean DEFAULT false;

    ALTER TABLE "authors_article_byline_featured_links"
      ADD CONSTRAINT "authors_article_byline_featured_links_parent_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."authors"("id")
      ON DELETE cascade ON UPDATE no action;

    CREATE INDEX "authors_article_byline_featured_links_order_idx"
      ON "authors_article_byline_featured_links" USING btree ("order");

    CREATE INDEX "authors_article_byline_featured_links_parent_idx"
      ON "authors_article_byline_featured_links" USING btree ("parent_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "authors_article_byline_featured_links" CASCADE;
    ALTER TABLE "authors" DROP COLUMN "article_byline_show_avatar";
    DROP TYPE "public"."enum_authors_article_byline_featured_links";
  `)
}
