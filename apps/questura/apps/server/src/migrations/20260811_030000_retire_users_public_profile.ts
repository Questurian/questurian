import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drops the copy of public authorship that `users` no longer owns (ADR-0007).
 *
 * The data was copied to `authors` by `20260811_010000_add_authors`, and
 * bylines were repointed by `20260811_020000_repoint_bylines_to_authors`, so
 * these columns have been a second, unread source of truth ever since. Left in
 * place they are worse than clutter: an admin editing them would see no effect
 * on the public site.
 *
 * Guarded rather than assumed: the migration refuses to drop anything if any
 * user still carries authorship that never made it into an author record.
 */
const PROFILE_COLUMNS = [
  'public_profile_avatar_id',
  'public_profile_display_name',
  'public_profile_bio',
  'public_profile_social_links_instagram',
  'public_profile_social_links_twitter',
  'public_profile_social_links_facebook',
  'public_profile_social_links_linkedin',
  'public_profile_social_links_reddit',
  'public_profile_social_links_youtube',
  'public_profile_social_links_patreon',
  'public_profile_social_links_website',
] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DO $$
      DECLARE unmigrated integer;
      BEGIN
        SELECT COUNT(*) INTO unmigrated
        FROM "users" u
        WHERE (u."slug" IS NOT NULL OR u."public_profile_display_name" IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM "authors" a WHERE a."user_id" = u."id");

        IF unmigrated > 0 THEN
          RAISE EXCEPTION
            '% user(s) still hold authorship with no author record; refusing to drop', unmigrated;
        END IF;
      END $$;
    `),
  )

  await db.execute(sql.raw(`DROP TABLE IF EXISTS "users_public_profile_expertise";`))
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "users_slug_idx";`))
  await db.execute(sql.raw(`ALTER TABLE "users" DROP COLUMN IF EXISTS "slug";`))

  for (const column of PROFILE_COLUMNS) {
    await db.execute(sql.raw(`ALTER TABLE "users" DROP COLUMN IF EXISTS "${column}";`))
  }
}

/**
 * Restores the columns but not their contents. The authorship now lives on
 * `authors`, and an author with no linked account has nowhere to be copied
 * back to, so re-populating would be a guess.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "slug" varchar;`))
  await db.execute(
    sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "users_slug_idx" ON "users" ("slug");`),
  )

  await db.execute(
    sql.raw(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "public_profile_avatar_id" integer;`),
  )
  for (const column of PROFILE_COLUMNS.filter((c) => c !== 'public_profile_avatar_id')) {
    await db.execute(sql.raw(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "${column}" varchar;`))
  }

  await db.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS "users_public_profile_expertise" (
        "_order" integer NOT NULL,
        "_parent_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "id" varchar PRIMARY KEY NOT NULL,
        "area" varchar NOT NULL
      );
    `),
  )
}
