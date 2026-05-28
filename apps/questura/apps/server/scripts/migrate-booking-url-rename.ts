/**
 * Phase 2 of ADR-0009 (Location Booking URL).
 *
 * Renames legacy Payload columns to the canonical `booking_url`:
 *   - dining.reservation_url → dining.booking_url
 *   - nightlife.<…>.reserve_url → nightlife.<…>.booking_url
 *
 * Idempotent: detects the legacy column via `information_schema`; if it does
 * not exist (already migrated, or fresh DB created after the schema rename),
 * the script no-ops.
 *
 * Run before booting Payload with the renamed schema to preserve existing
 * seeded data. If skipped, Payload's auto-push will drop the old column on
 * first boot — fine for dev databases that can be re-synced from LM.
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@/payload.config'

interface ColumnInfo {
  table_name: string
  column_name: string
}

const LEGACY_PATTERNS: Array<{
  table: string
  legacySuffix: string
  newSuffix: string
}> = [
  { table: 'dining', legacySuffix: 'reservation_url', newSuffix: 'booking_url' },
  { table: 'nightlife', legacySuffix: 'reserve_url', newSuffix: 'booking_url' },
]

async function findLegacyColumns(
  pool: any,
  table: string,
  legacySuffix: string,
): Promise<ColumnInfo[]> {
  const result = await pool.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name LIKE $2`,
    [table, `%${legacySuffix}`],
  )
  return result.rows
}

async function columnExists(
  pool: any,
  table: string,
  column: string,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [table, column],
  )
  return result.rowCount > 0
}

async function main() {
  const payload = await getPayload({ config })
  const pool = (payload.db as any).pool

  if (!pool) {
    throw new Error('Expected Payload db.pool to be available (postgresAdapter).')
  }

  let renamedCount = 0
  let skippedCount = 0

  for (const { table, legacySuffix, newSuffix } of LEGACY_PATTERNS) {
    const legacyColumns = await findLegacyColumns(pool, table, legacySuffix)

    if (legacyColumns.length === 0) {
      console.log(`[${table}] no columns ending in "${legacySuffix}" — nothing to rename`)
      continue
    }

    for (const { table_name, column_name } of legacyColumns) {
      const newColumnName =
        column_name.slice(0, column_name.length - legacySuffix.length) + newSuffix

      if (await columnExists(pool, table_name, newColumnName)) {
        console.log(
          `[${table_name}] both "${column_name}" and "${newColumnName}" present — skipping (resolve manually).`,
        )
        skippedCount += 1
        continue
      }

      await pool.query(
        `ALTER TABLE "${table_name}" RENAME COLUMN "${column_name}" TO "${newColumnName}"`,
      )
      console.log(`[${table_name}] renamed "${column_name}" → "${newColumnName}"`)
      renamedCount += 1
    }
  }

  console.log(`\nDone. Renamed ${renamedCount} column(s); skipped ${skippedCount}.`)
  process.exit(0)
}

main().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
