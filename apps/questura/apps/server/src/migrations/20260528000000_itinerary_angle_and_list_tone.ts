import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Adds per-stop `angle` to the pooled listicle-itinerary block tables and a
 * `list_tone` to the article. Mirrors the schema `push` already generated in
 * dev (verified against the live schema): one enum type per block table, each
 * carrying the full union of angle values across categories, plus a single
 * `list_tone` enum on the parent table defaulting to 'elevated'.
 *
 * `key_location` and `tour-agency` block tables intentionally get no angle.
 */

// Full union of angle values — itinerary stops span every category, so each
// block's angle enum carries all of them (the AI Blog Writer scopes choices to
// the stop's category). Order matches the Payload `angleField` option order.
const ANGLE_VALUES = [
  'signature-dish',
  'atmosphere',
  'founders-backstory',
  'insider-tip',
  'best-for',
  'whats-different',
  'best-for-night',
  'location-and-setting',
  'view-and-vista',
  'design-and-aesthetic',
  'signature-amenity',
  'food-and-beverage',
  'trip-fit',
  'property-backstory',
  'booking-tip',
  'signature-feature',
  'setting',
  'history-built',
  'visit-time-tip',
  'best-for-visit-type',
]

const LIST_TONE_VALUES = [
  'elevated',
  'casual',
  'hidden-gem',
  'family-friendly',
  'date-night',
  'budget',
]

// Block tables that carry an angle (pooled categories only).
const ANGLE_BLOCK_TABLES = [
  'listicle_itineraries_blocks_itinerary_dining',
  'listicle_itineraries_blocks_itinerary_accommodations',
  'listicle_itineraries_blocks_itinerary_attractions',
  'listicle_itineraries_blocks_itinerary_nightlife',
  'listicle_itineraries_blocks_itinerary_where_staying',
]

const LIST_TONE_ENUM = 'enum_listicle_itineraries_list_tone'

const angleEnumFor = (table: string): string => `enum_${table}_angle`

const enumValuesLiteral = (values: string[]): string =>
  values.map((value) => `'${value}'`).join(', ')

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Per-stop angle on each pooled block table.
  for (const table of ANGLE_BLOCK_TABLES) {
    const enumName = angleEnumFor(table)
    await db.execute(
      sql.raw(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${enumName}') THEN
            CREATE TYPE "${enumName}" AS ENUM(${enumValuesLiteral(ANGLE_VALUES)});
          END IF;
        END $$;
      `),
    )
    await db.execute(
      sql.raw(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "angle" "${enumName}";
      `),
    )
  }

  // One list tone for the whole itinerary, defaulting to 'elevated'.
  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${LIST_TONE_ENUM}') THEN
          CREATE TYPE "${LIST_TONE_ENUM}" AS ENUM(${enumValuesLiteral(LIST_TONE_VALUES)});
        END IF;
      END $$;
    `),
  )
  await db.execute(
    sql.raw(`
      ALTER TABLE "listicle_itineraries"
      ADD COLUMN IF NOT EXISTS "list_tone" "${LIST_TONE_ENUM}" DEFAULT 'elevated';
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "listicle_itineraries"
      DROP COLUMN IF EXISTS "list_tone";
    `),
  )
  await db.execute(sql.raw(`DROP TYPE IF EXISTS "${LIST_TONE_ENUM}";`))

  for (const table of ANGLE_BLOCK_TABLES) {
    await db.execute(
      sql.raw(`
        ALTER TABLE "${table}"
        DROP COLUMN IF EXISTS "angle";
      `),
    )
    await db.execute(sql.raw(`DROP TYPE IF EXISTS "${angleEnumFor(table)}";`))
  }
}
