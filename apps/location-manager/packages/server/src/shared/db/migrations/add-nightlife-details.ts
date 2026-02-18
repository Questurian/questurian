import Database from "bun:sqlite";

/**
 * Migration: Add nightlife_details_json column to locations table.
 *
 * Stores raw nightlife-specific fields as JSON so we can iterate the
 * overlap model later without blocking document creation now.
 */
export function addNightlifeDetails(db: Database): void {
  console.log("🔄 Starting migration: Add nightlife_details_json column");

  try {
    const tableInfo = db.query("PRAGMA table_info(locations)").all() as Array<{ name: string }>;
    const hasColumn = tableInfo.some((col) => col.name === "nightlife_details_json");

    if (hasColumn) {
      console.log("  ✓ nightlife_details_json column already exists (migration already applied)");
      return;
    }

    db.run(`
      ALTER TABLE locations ADD COLUMN nightlife_details_json TEXT
    `);

    console.log("  ✓ Successfully added nightlife_details_json column");
  } catch (error) {
    console.error("  ✗ Failed to add nightlife_details_json column:", error);
    throw error;
  }
}
