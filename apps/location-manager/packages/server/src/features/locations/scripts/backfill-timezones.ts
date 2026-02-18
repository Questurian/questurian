/**
 * Backfill iana_time_id for locations using BigDataCloud timezone API.
 *
 * Usage:
 *   pnpm run packages/server/src/features/locations/scripts/backfill-timezones.ts
 *   pnpm run packages/server/src/features/locations/scripts/backfill-timezones.ts --dry-run
 *   pnpm run packages/server/src/features/locations/scripts/backfill-timezones.ts --limit=50 --sleep=300
 */

import { initDb, getDb } from "@server/shared/db/client";
import { ServiceContainer } from "../container/service-container";
import { updateLocationById } from "../repositories/core/location.repository";

type Row = {
  id: number;
  name: string;
  lat: number;
  lng: number;
};

function getArgValue(prefix: string): string | null {
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function backfillTimezones() {
  const dryRun = process.argv.includes("--dry-run");
  const limitValue = getArgValue("--limit=");
  const sleepValue = getArgValue("--sleep=");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : null;
  const sleepMs = sleepValue ? Number.parseInt(sleepValue, 10) : 250;

  if (limitValue && Number.isNaN(limit)) {
    throw new Error(`Invalid --limit value: ${limitValue}`);
  }
  if (sleepValue && Number.isNaN(sleepMs)) {
    throw new Error(`Invalid --sleep value: ${sleepValue}`);
  }

  initDb();
  const db = getDb();
  const container = ServiceContainer.getInstance();

  const rows = db.query(`
    SELECT id, name, lat, lng
    FROM entities
    WHERE (iana_time_id IS NULL OR TRIM(iana_time_id) = '')
      AND lat IS NOT NULL
      AND lng IS NOT NULL
    ORDER BY id ASC
  `).all() as Row[];

  const targetRows = limit ? rows.slice(0, limit) : rows;

  console.log(`\nBackfill timezones`);
  console.log(`  Total candidates: ${rows.length}`);
  console.log(`  Processing: ${targetRows.length}`);
  console.log(`  Dry run: ${dryRun ? "yes" : "no"}`);
  console.log(`  Sleep: ${sleepMs}ms\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of targetRows) {
    try {
      const timezone = await container.bigDataCloudClient.getTimezone(row.lat, row.lng);
      const ianaTimeId = timezone.ianaTimeId || null;
      if (!ianaTimeId) {
        skipped += 1;
        console.log(`- [skip] ${row.id} ${row.name} (no ianaTimeId)`);
        continue;
      }

      if (!dryRun) {
        const ok = updateLocationById(row.id, { ianaTimeId });
        if (!ok) {
          failed += 1;
          console.log(`- [fail] ${row.id} ${row.name} (${ianaTimeId})`);
        } else {
          updated += 1;
          console.log(`- [ok]   ${row.id} ${row.name} (${ianaTimeId})`);
        }
      } else {
        updated += 1;
        console.log(`- [dry]  ${row.id} ${row.name} (${ianaTimeId})`);
      }
    } catch (error) {
      failed += 1;
      console.log(`- [err]  ${row.id} ${row.name} (${String(error)})`);
    }

    if (sleepMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }

  console.log(`\nDone`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed: ${failed}\n`);
}

backfillTimezones().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
