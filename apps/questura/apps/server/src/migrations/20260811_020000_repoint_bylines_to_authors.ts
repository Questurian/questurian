import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Second half of ADR-0007: article bylines stop pointing at `users` and point
 * at `authors` instead.
 *
 * `author_id` keeps its name and stays NOT NULL; only what it references
 * changes, so every row must be remapped inside the same transaction as the
 * constraint swap or the FK will not validate.
 *
 * Any account that owns an article but has no author record gets one first.
 * That can happen for a staff row with no slug -- the previous migration
 * backfilled on the presence of a slug, which is the marker of a public author
 * page, and someone can hold an unpublished draft without ever having had one.
 */
const BYLINE_TABLES = [
  { table: 'articles', constraint: 'articles_author_id_users_id_fk' },
  {
    table: 'single_type_listicles',
    constraint: 'single_type_listicles_author_id_users_id_fk',
  },
  {
    table: 'listicle_itineraries',
    constraint: 'listicle_itineraries_author_id_users_id_fk',
  },
] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // 1. Every account that owns a byline needs an author record to receive it.
  for (const { table } of BYLINE_TABLES) {
    await db.execute(
      sql.raw(`
        INSERT INTO "authors" ("slug", "user_id", "display_name")
        SELECT
          u."slug",
          u."id",
          COALESCE(
            NULLIF(TRIM(u."public_profile_display_name"), ''),
            NULLIF(TRIM(CONCAT_WS(' ', u."first_name", u."last_name")), ''),
            u."email"
          )
        FROM "users" u
        WHERE EXISTS (SELECT 1 FROM "${table}" t WHERE t."author_id" = u."id")
          AND NOT EXISTS (SELECT 1 FROM "authors" a WHERE a."user_id" = u."id");
      `),
    )
  }

  for (const { table, constraint } of BYLINE_TABLES) {
    // 2. Drop the old FK before rewriting the values it guards.
    await db.execute(
      sql.raw(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}";`),
    )

    // 3. Remap user id -> author id.
    await db.execute(
      sql.raw(`
        UPDATE "${table}" t
        SET "author_id" = a."id"
        FROM "authors" a
        WHERE a."user_id" = t."author_id";
      `),
    )

    // 4. Refuse to proceed if anything failed to map. A byline pointing at a
    //    user id that is now read as an author id would silently attribute an
    //    article to the wrong person, which is worse than a failed migration.
    await db.execute(
      sql.raw(`
        DO $$
        DECLARE orphaned integer;
        BEGIN
          SELECT COUNT(*) INTO orphaned
          FROM "${table}" t
          WHERE t."author_id" IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "authors" a WHERE a."id" = t."author_id");

          IF orphaned > 0 THEN
            RAISE EXCEPTION
              '${table}: % byline(s) did not map to an author record', orphaned;
          END IF;
        END $$;
      `),
    )

    // 5. Point the FK at authors. ON DELETE SET NULL would violate the NOT NULL
    //    column, and deleting an author is already admin-only and rare, so
    //    RESTRICT is the honest constraint: it refuses to orphan a byline.
    await db.execute(
      sql.raw(`
        ALTER TABLE "${table}"
          ADD CONSTRAINT "${table}_author_id_authors_id_fk"
          FOREIGN KEY ("author_id")
          REFERENCES "public"."authors"("id")
          ON DELETE restrict
          ON UPDATE no action;
      `),
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const { table, constraint } of BYLINE_TABLES) {
    await db.execute(
      sql.raw(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_author_id_authors_id_fk";`),
    )

    // Authors with no linked account cannot be represented as a user id, so
    // their articles are left pointing at the author id. This down migration
    // is only safe on a database where every author still has an account.
    await db.execute(
      sql.raw(`
        UPDATE "${table}" t
        SET "author_id" = a."user_id"
        FROM "authors" a
        WHERE a."id" = t."author_id" AND a."user_id" IS NOT NULL;
      `),
    )

    await db.execute(
      sql.raw(`
        ALTER TABLE "${table}"
          ADD CONSTRAINT "${constraint}"
          FOREIGN KEY ("author_id")
          REFERENCES "public"."users"("id")
          ON DELETE set null
          ON UPDATE no action;
      `),
    )
  }
}
