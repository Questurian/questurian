import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Indexes for the public list reads.
 *
 * Every public feed filters on `status` and `language`, then on either
 * `location` (the location feed, plus a `LIKE 'key|%'` descendant match) or
 * `author_id` (the author page), and orders by `published_at DESC`. None of
 * those columns carried an index: the three content tables indexed `title`,
 * `slug`, `language`, `author`, `canonical_path`, `created_at` and
 * `updated_at`, so every feed was a sequential scan plus a sort.
 *
 * The indexes are partial on `status = 'published'`, because the public reads
 * never ask for anything else and a partial index stays small as drafts
 * accumulate. `text_pattern_ops` on `location` is what lets the descendant
 * `LIKE 'peru|lima|%'` use an index rather than scan; it is a second index
 * rather than part of the composite because the composite serves the equality
 * match and the ordering.
 *
 * Additive only: no column, constraint or row is touched. Written out one
 * statement at a time rather than looped, because `check-pending-migrations`
 * can only read migrations whose SQL is static.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "articles_public_location_feed_idx"
    ON "articles" ("location", "language", "published_at" DESC)
    WHERE "status" = 'published';
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "articles_public_location_prefix_idx"
    ON "articles" ("location" text_pattern_ops)
    WHERE "status" = 'published';
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "articles_public_author_feed_idx"
    ON "articles" ("author_id", "language", "published_at" DESC)
    WHERE "status" = 'published';
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "single_type_listicles_public_location_feed_idx"
    ON "single_type_listicles" ("location", "language", "published_at" DESC)
    WHERE "status" = 'published';
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "single_type_listicles_public_location_prefix_idx"
    ON "single_type_listicles" ("location" text_pattern_ops)
    WHERE "status" = 'published';
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "single_type_listicles_public_author_feed_idx"
    ON "single_type_listicles" ("author_id", "language", "published_at" DESC)
    WHERE "status" = 'published';
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "listicle_itineraries_public_location_feed_idx"
    ON "listicle_itineraries" ("location", "language", "published_at" DESC)
    WHERE "status" = 'published';
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "listicle_itineraries_public_location_prefix_idx"
    ON "listicle_itineraries" ("location" text_pattern_ops)
    WHERE "status" = 'published';
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "listicle_itineraries_public_author_feed_idx"
    ON "listicle_itineraries" ("author_id", "language", "published_at" DESC)
    WHERE "status" = 'published';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "articles_public_location_feed_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "articles_public_location_prefix_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "articles_public_author_feed_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "single_type_listicles_public_location_feed_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "single_type_listicles_public_location_prefix_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "single_type_listicles_public_author_feed_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "listicle_itineraries_public_location_feed_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "listicle_itineraries_public_location_prefix_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "listicle_itineraries_public_author_feed_idx";`)
}
