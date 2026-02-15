import Database from "bun:sqlite";

/**
 * Migration: Add price_level column to locations table
 *
 * Stores the price range string from TripAdvisor (e.g. "$$ - $$$").
 * Synced to Payload CMS as priceLevel.
 */
export function addLocationPriceLevel(db: Database): void {
  console.log("🔄 Starting migration: Add price_level to locations table");

  try {
    const tableInfo = db.query("PRAGMA table_info('locations')").all() as Array<{ name: string }>;
    const columnNames = new Set(tableInfo.map((col) => col.name));

    if (!columnNames.has("price_level")) {
      console.log("  📝 Adding price_level column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN price_level TEXT
      `);
    } else {
      console.log("  ℹ️  Column 'price_level' already exists, skipping");
    }

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
