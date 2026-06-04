#!/usr/bin/env bun
/**
 * One-off: delete all entities (and image folders) using these locationKeys,
 * then remove matching rows from location_taxonomy.
 *
 * Run from packages/server:
 *   bun run src/features/locations/scripts/delete-locations-by-location-keys.ts
 *
 * Uses the same DB as the app (see DB_PATH / data/location.sqlite).
 */
import { getDb, initDb } from "../../../shared/db/client";
import { ServiceContainer } from "../container/service-container";

const KEYS = ["peru|lima|lima", "peru|lima|lima-centro"] as const;

async function main() {
  initDb();
  const db = getDb();
  const container = ServiceContainer.getInstance();

  const placeholders = KEYS.map(() => "?").join(",");

  const rows = db
    .query(
      `
    SELECT id, name, category, locationKey
    FROM entities
    WHERE locationKey IN (${placeholders})
  `
    )
    .all(...KEYS) as Array<{
    id: number;
    name: string;
    category: string;
    locationKey: string;
  }>;

  console.log(`Found ${rows.length} entity/entities with locationKey in [${KEYS.join(", ")}]:`);
  for (const r of rows) {
    console.log(`  id=${r.id} ${r.category} ${r.name} (${r.locationKey})`);
  }

  for (const r of rows) {
    const ok = await container.core.mutation.deleteLocationById(r.id);
    console.log(ok ? `  Deleted entity ${r.id}` : `  FAILED entity ${r.id}`);
  }

  const taxResult = db
    .query(
      `
    DELETE FROM location_taxonomy
    WHERE locationKey IN (${placeholders})
  `
    )
    .run(...KEYS);
  console.log(`Removed ${taxResult.changes} row(s) from location_taxonomy for those keys.`);

  console.log("Done.");
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
