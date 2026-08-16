import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Renames the price-tick enum members to GraphQL-safe digits.
 *
 * Payload builds GraphQL enum *member* names from select option values, and
 * `$` is not a legal GraphQL name -- these two enums were enough to abort the
 * whole `/api/graphql` schema build, so every GraphQL query returned an empty
 * 500. See `shared/content/priceTier.ts`.
 *
 * `ALTER TYPE ... RENAME VALUE` rewrites the label in place: no table is
 * touched, no row is rewritten, and the 38 `accommodations.core_price` values
 * carry their meaning across ('$$' becomes '2'). That is why this is a rename
 * rather than a new type plus a backfill.
 *
 * Each rename is guarded on the old label still being present, so re-running
 * the migration is a no-op instead of an error.
 */

const RENAMES: { type: string; from: string; to: string }[] = [
  { type: 'enum_accommodations_core_price', from: '$', to: '1' },
  { type: 'enum_accommodations_core_price', from: '$$', to: '2' },
  { type: 'enum_accommodations_core_price', from: '$$$', to: '3' },
  { type: 'enum_accommodations_core_price', from: '$$$$', to: '4' },
  { type: 'lit_tour_price_tier', from: '$', to: '1' },
  { type: 'lit_tour_price_tier', from: '$$', to: '2' },
  { type: 'lit_tour_price_tier', from: '$$$', to: '3' },
  { type: 'lit_tour_price_tier', from: '$$$$', to: '4' },
]

/**
 * A plain `$$` dollar-quote tag would be terminated by the very labels being
 * renamed, so every block below is tagged `$price_tier$` (same trick the
 * migration that created these enums had to use).
 */
function renameStatements(renames: typeof RENAMES): string {
  return renames
    .map(
      ({ type, from, to }) => `
      DO $price_tier$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = '${type}' AND e.enumlabel = '${from}'
        ) THEN
          ALTER TYPE "${type}" RENAME VALUE '${from}' TO '${to}';
        END IF;
      END $price_tier$;`,
    )
    .join('\n')
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(renameStatements(RENAMES)))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(renameStatements(RENAMES.map(({ type, from, to }) => ({ type, from: to, to: from })))),
  )
}
