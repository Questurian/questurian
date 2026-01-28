import Database from "bun:sqlite";

/**
 * Migration: Add place_id column to locations table
 *
 * Adds a place_id field to store the Google Place ID for each location.
 * This allows direct linking to Google Maps/Places API for additional details.
 */
export function addLocationPlaceId(db: Database): void {
  console.log("🔄 Starting migration: Add place_id column to locations table");

  try {
    // Check if column already exists
    const tableInfo = db.query("PRAGMA table_info(locations)").all() as Array<{ name: string }>;
    const hasPlaceId = tableInfo.some(col => col.name === "place_id");

    if (hasPlaceId) {
      console.log("  ⏭️  Column place_id already exists, skipping migration");
      return;
    }

    // Add the place_id column
    console.log("  📝 Adding place_id column...");
    db.run(`
      ALTER TABLE locations
      ADD COLUMN place_id TEXT
    `);

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
