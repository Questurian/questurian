import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Bookmarks: private reader markers on URL-bearing editorial targets (ADR-0010).
 *
 * Additive only. One new table, its indexes, and the `payload_locked_documents_rels`
 * column every Payload collection needs. Nothing existing is altered, so this
 * is inert for every current reader until the client ships a control that
 * writes to it.
 *
 * Hand-written rather than generated, matching the 30 of 33 migrations here
 * that carry no drizzle snapshot: the snapshot chain is incomplete, so
 * `migrate:create` diffs against an ancient one and proposes bogus renames of
 * unrelated tables.
 *
 * `auth_user_id` is a varchar holding a Better Auth user id, deliberately not a
 * foreign key. Better Auth owns `visitor_auth_users` as auth infrastructure
 * (ADR-0004), and a bookmark must not be able to fail on the billing or auth
 * schema's lifecycle. Orphan rows after an account erasure are cleaned by that
 * workflow when it exists.
 *
 * `target_id` is likewise not a foreign key, and that is the load-bearing part
 * of the design rather than a shortcut: a Bookmark never blocks an editorial
 * action, so an admin deleting an article must not be refused by a reader's
 * saved copy. Dangling rows are expected and are filtered on read by the same
 * published gate the public index uses.
 *
 * The compound unique index is the only thing standing between a double-click
 * and two rows.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_bookmarks_target_type" AS ENUM('articles', 'maps', 'itineraries');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS "bookmarks" (
      "id" serial PRIMARY KEY NOT NULL,
      "auth_user_id" varchar NOT NULL,
      "target_type" "public"."enum_bookmarks_target_type" NOT NULL,
      "target_id" numeric NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "bookmarks_auth_user_id_idx" ON "bookmarks" USING btree ("auth_user_id");
    CREATE INDEX IF NOT EXISTS "bookmarks_target_type_idx" ON "bookmarks" USING btree ("target_type");
    CREATE INDEX IF NOT EXISTS "bookmarks_target_id_idx" ON "bookmarks" USING btree ("target_id");
    CREATE INDEX IF NOT EXISTS "bookmarks_updated_at_idx" ON "bookmarks" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "bookmarks_created_at_idx" ON "bookmarks" USING btree ("created_at");

    CREATE UNIQUE INDEX IF NOT EXISTS "bookmarks_auth_user_id_target_type_target_id_idx"
      ON "bookmarks" USING btree ("auth_user_id", "target_type", "target_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "bookmarks_id" integer;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_bookmarks_fk"
        FOREIGN KEY ("bookmarks_id")
        REFERENCES "public"."bookmarks"("id")
        ON DELETE cascade
        ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_bookmarks_id_idx" ON "payload_locked_documents_rels" USING btree ("bookmarks_id");
  `))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`
    DROP INDEX IF EXISTS "payload_locked_documents_rels_bookmarks_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "bookmarks_id";
    DROP TABLE IF EXISTS "bookmarks";
    DROP TYPE IF EXISTS "public"."enum_bookmarks_target_type";
  `))
}
