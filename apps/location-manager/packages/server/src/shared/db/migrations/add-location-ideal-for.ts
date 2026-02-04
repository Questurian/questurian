import Database from "bun:sqlite";

/**
 * Migration: Add ideal_for_json field to locations table
 *
 * Stores up to four "Ideal For" tags as a JSON-encoded string array.
 */
export function addLocationIdealFor(db: Database): void {
  console.log("🔄 Starting migration: Add ideal_for_json column to locations table");

  try {
    const tableInfo = db.query("PRAGMA table_info(locations)").all() as Array<{ name: string }>;
    const hasIdealFor = tableInfo.some((col) => col.name === "ideal_for_json");

    if (hasIdealFor) {
      console.log("  ⏭️  ideal_for_json column already exists, skipping migration");
      return;
    }

    console.log("  📝 Adding ideal_for_json column...");
    db.run(`
      ALTER TABLE locations
      ADD COLUMN ideal_for_json TEXT
    `);

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
