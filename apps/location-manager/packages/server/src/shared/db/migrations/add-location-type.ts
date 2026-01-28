import Database from "bun:sqlite";

/**
 * Migration: Add type column to locations table
 *
 * Adds a type field to store the specific type of location (e.g., "restaurant", "hotel", etc.)
 * This replaces the old category-based type mapping with direct type storage.
 */
export function addLocationType(db: Database): void {
  console.log("🔄 Starting migration: Add type column to locations table");

  try {
    // Check if type column already exists
    const tableInfo = db.query("PRAGMA table_info(locations)").all() as Array<{ name: string }>;
    const hasTypeColumn = tableInfo.some(col => col.name === "type");

    if (hasTypeColumn) {
      console.log("  ✓ type column already exists in locations table (migration already applied)");
      return;
    }

    console.log("  📝 Adding type column to locations table...");
    db.run(`
      ALTER TABLE locations ADD COLUMN type TEXT
    `);

    console.log("  ✓ Successfully added type column to locations table");
  } catch (error) {
    console.error("  ✗ Failed to add type column:", error);
    throw error;
  }
}
