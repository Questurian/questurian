import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Public authorship moves out of `Users` (ADR-0007).
 *
 * One `authors` row is created per `users` row that already has a slug -- a
 * slug is exactly the marker that a person has a public author page -- and the
 * public profile is copied across verbatim. `user_id` is nullable and uniquely
 * indexed: at most one author per account, and any number of authors with no
 * account at all. That nullability is the point of the collection, so the FK is
 * ON DELETE SET NULL rather than CASCADE -- deleting the person must not delete
 * their byline.
 *
 * Bylines still point at `users` after this migration. Repointing them is a
 * separate step, so this one is additive and reversible on its own.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS "authors" (
        "id" serial PRIMARY KEY NOT NULL,
        "slug" varchar,
        "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "display_name" varchar NOT NULL,
        "avatar_id" integer REFERENCES "media_assets"("id") ON DELETE SET NULL,
        "bio" varchar,
        "social_links_instagram" varchar,
        "social_links_twitter" varchar,
        "social_links_facebook" varchar,
        "social_links_linkedin" varchar,
        "social_links_reddit" varchar,
        "social_links_youtube" varchar,
        "social_links_patreon" varchar,
        "social_links_website" varchar,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `),
  )

  await db.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS "authors_expertise" (
        "_order" integer NOT NULL,
        "_parent_id" integer NOT NULL REFERENCES "authors"("id") ON DELETE CASCADE,
        "id" varchar PRIMARY KEY NOT NULL,
        "area" varchar NOT NULL
      );
    `),
  )

  await db.execute(
    sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "authors_slug_idx" ON "authors" ("slug");`),
  )
  await db.execute(
    sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "authors_user_idx" ON "authors" ("user_id");`),
  )
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "authors_expertise_parent_id_idx" ON "authors_expertise" ("_parent_id");`,
    ),
  )

  // Payload's document locking keeps one FK column per lockable collection.
  // Without it every edit in the admin panel fails on a missing column, since
  // the lock check runs before the write.
  await db.execute(
    sql.raw(`
      ALTER TABLE "payload_locked_documents_rels"
        ADD COLUMN IF NOT EXISTS "authors_id" integer;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_schema = 'public'
            AND constraint_name = 'payload_locked_documents_rels_authors_fk'
        ) THEN
          ALTER TABLE "payload_locked_documents_rels"
            ADD CONSTRAINT "payload_locked_documents_rels_authors_fk"
            FOREIGN KEY ("authors_id")
            REFERENCES "public"."authors"("id")
            ON DELETE cascade
            ON UPDATE no action;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_authors_id_idx"
        ON "payload_locked_documents_rels" USING btree ("authors_id");
    `),
  )

  // Backfill: one author per staff row that already has a public slug.
  // `display_name` is NOT NULL, so fall back through the same chain the old
  // Users slug hook used before finally reusing the slug itself.
  await db.execute(
    sql.raw(`
      INSERT INTO "authors" (
        "slug", "user_id", "display_name", "avatar_id", "bio",
        "social_links_instagram", "social_links_twitter", "social_links_facebook",
        "social_links_linkedin", "social_links_reddit", "social_links_youtube",
        "social_links_patreon", "social_links_website"
      )
      SELECT
        u."slug",
        u."id",
        COALESCE(
          NULLIF(TRIM(u."public_profile_display_name"), ''),
          NULLIF(TRIM(CONCAT_WS(' ', u."first_name", u."last_name")), ''),
          u."slug"
        ),
        u."public_profile_avatar_id",
        u."public_profile_bio",
        u."public_profile_social_links_instagram",
        u."public_profile_social_links_twitter",
        u."public_profile_social_links_facebook",
        u."public_profile_social_links_linkedin",
        u."public_profile_social_links_reddit",
        u."public_profile_social_links_youtube",
        u."public_profile_social_links_patreon",
        u."public_profile_social_links_website"
      FROM "users" u
      WHERE u."slug" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "authors" a WHERE a."user_id" = u."id");
    `),
  )

  // Payload's array tables carry a varchar id; reuse the source row's id so a
  // re-run cannot duplicate expertise entries.
  await db.execute(
    sql.raw(`
      INSERT INTO "authors_expertise" ("_order", "_parent_id", "id", "area")
      SELECT e."_order", a."id", e."id", e."area"
      FROM "users_public_profile_expertise" e
      JOIN "authors" a ON a."user_id" = e."_parent_id"
      WHERE NOT EXISTS (
        SELECT 1 FROM "authors_expertise" ae WHERE ae."id" = e."id"
      );
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DROP INDEX IF EXISTS "payload_locked_documents_rels_authors_id_idx";
      ALTER TABLE "payload_locked_documents_rels"
        DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_authors_fk",
        DROP COLUMN IF EXISTS "authors_id";
    `),
  )
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "authors_expertise";`))
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "authors";`))
}
