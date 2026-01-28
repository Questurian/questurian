import Database from "bun:sqlite";

/**
 * Migration: Add TripAdvisor fields to locations table
 *
 * Adds tripadvisor_url and tripadvisor_location_id columns to store
 * TripAdvisor metadata for each location.
 */
export function addTripadvisorFields(db: Database): void {
  console.log("🔄 Starting migration: Add TripAdvisor fields to locations table");

  try {
    const tableInfo = db.query("PRAGMA table_info(locations)").all() as Array<{ name: string }>;
    const hasTripadvisorUrl = tableInfo.some(col => col.name === "tripadvisor_url");
    const hasTripadvisorLocationId = tableInfo.some(col => col.name === "tripadvisor_location_id");

    if (hasTripadvisorUrl && hasTripadvisorLocationId) {
      console.log("  ⏭️  TripAdvisor columns already exist, skipping migration");
      return;
    }

    if (!hasTripadvisorUrl) {
      console.log("  📝 Adding tripadvisor_url column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN tripadvisor_url TEXT
      `);
    }

    if (!hasTripadvisorLocationId) {
      console.log("  📝 Adding tripadvisor_location_id column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN tripadvisor_location_id TEXT
      `);
    }

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
