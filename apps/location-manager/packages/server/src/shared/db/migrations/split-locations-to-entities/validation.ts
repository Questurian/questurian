import type { Database } from "bun:sqlite";

export function validateRowCounts(db: Database, legacyLocationsTable: string | null): void {
  if (!legacyLocationsTable) return;

  const legacyLocationCount = db.query(`SELECT COUNT(*) as count FROM ${legacyLocationsTable}`).get() as { count: number };
  const entitiesCount = db.query("SELECT COUNT(*) as count FROM entities").get() as { count: number };
  const typedCount = db.query(`
    SELECT
      (SELECT COUNT(*) FROM dining_locations) +
      (SELECT COUNT(*) FROM nightlife_locations) +
      (SELECT COUNT(*) FROM accommodations_locations) +
      (SELECT COUNT(*) FROM attractions_locations) +
      (SELECT COUNT(*) FROM key_locations_locations) AS count
  `).get() as { count: number };

  if (legacyLocationCount.count !== entitiesCount.count || entitiesCount.count !== typedCount.count) {
    throw new Error(
      `Entity migration row count mismatch. ` +
      `legacy=${legacyLocationCount.count}, entities=${entitiesCount.count}, typed=${typedCount.count}`
    );
  }
}
