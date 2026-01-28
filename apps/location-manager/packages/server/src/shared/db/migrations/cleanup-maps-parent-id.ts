import { getDb } from "../client";

/**
 * Migration: Cleanup any maps-type locations that incorrectly have parent_id set
 * This is a defensive migration to fix any existing data inconsistencies.
 */
export function cleanupMapsParentId() {
  const db = getDb();

  try {
    // Find any maps with parent_id set (shouldn't exist, but just in case)
    const query = db.query(
      "SELECT id, name, parent_id FROM location WHERE type = 'maps' AND parent_id IS NOT NULL"
    );
    const invalidMaps = query.all() as Array<{ id: number; name: string; parent_id: number }>;

    if (invalidMaps.length > 0) {
      console.warn(
        `⚠️  Found ${invalidMaps.length} map(s) with invalid parent_id:`,
        invalidMaps
      );

      // Clear parent_id for all maps
      db.run("UPDATE location SET parent_id = NULL WHERE type = 'maps' AND parent_id IS NOT NULL");

      console.log(`✅ Cleared parent_id from ${invalidMaps.length} map-type location(s)`);
    } else {
      console.log("✅ No map-type locations with parent_id found. Database is clean.");
    }

    return true;
  } catch (error) {
    console.error("❌ Migration failed:", error);
    return false;
  }
}
