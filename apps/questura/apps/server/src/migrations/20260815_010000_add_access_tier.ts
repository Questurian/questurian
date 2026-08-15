import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Access tier on the three editorial collections (ADR-0009).
 *
 * Every existing row backfills to `free` through the column default, so this
 * migration is inert by construction: nothing on the live site changes tier
 * until an editor sets one. That is the point of landing the shape before the
 * behaviour -- the paywall's first deploy proves the machinery without being
 * able to lock anyone out of anything.
 *
 * `NOT NULL` with a default rather than a nullable column, because
 * `isGatedItem` treats anything that is not exactly `member` as free. A
 * nullable column would make that fallback load-bearing in production instead
 * of a convenience for hand-built test objects, and "gated" is not a state
 * anything should arrive at by accident.
 *
 * One enum type per table, matching what the Payload postgres adapter derives
 * from a `select` field. Adding a third tier later means `ALTER TYPE`, which
 * the deploy preflight blocks as a type rewrite -- that is deliberate friction,
 * not an oversight, and the split recipe in infra/softprod/README.md covers it.
 *
 * DDL only. No backfill statement, because the default does the backfill and
 * the preflight blocks `UPDATE` as a data rewrite.
 */
const TABLES = [
  ['articles', 'enum_articles_access'],
  ['listicle_itineraries', 'enum_listicle_itineraries_access'],
  ['single_type_listicles', 'enum_single_type_listicles_access'],
] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DO $$ BEGIN
        CREATE TYPE "public"."enum_articles_access" AS ENUM('free', 'member');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE "public"."enum_listicle_itineraries_access" AS ENUM('free', 'member');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE "public"."enum_single_type_listicles_access" AS ENUM('free', 'member');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `),
  )

  await db.execute(
    sql.raw(`
      ALTER TABLE "articles"
      ADD COLUMN IF NOT EXISTS "access" "public"."enum_articles_access" DEFAULT 'free' NOT NULL;

      ALTER TABLE "listicle_itineraries"
      ADD COLUMN IF NOT EXISTS "access" "public"."enum_listicle_itineraries_access" DEFAULT 'free' NOT NULL;

      ALTER TABLE "single_type_listicles"
      ADD COLUMN IF NOT EXISTS "access" "public"."enum_single_type_listicles_access" DEFAULT 'free' NOT NULL;
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const [table, enumName] of TABLES) {
    await db.execute(sql.raw(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "access";`))
    await db.execute(sql.raw(`DROP TYPE IF EXISTS "public"."${enumName}";`))
  }
}
