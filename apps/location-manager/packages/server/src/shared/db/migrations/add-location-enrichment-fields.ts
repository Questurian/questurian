import Database from "bun:sqlite";

/**
 * Migration: Add enrichment fields to locations table
 *
 * Adds email, hours_json, and neighborhood_description columns for
 * TripAdvisor-enriched data that should live on the location itself.
 */
export function addLocationEnrichmentFields(db: Database): void {
  console.log("🔄 Starting migration: Add enrichment fields to locations table");

  try {
    const tableInfo = db.query("PRAGMA table_info('locations')").all() as Array<{ name: string }>;
    const columnNames = new Set(tableInfo.map((col) => col.name));

    if (!columnNames.has("email")) {
      console.log("  📝 Adding email column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN email TEXT
      `);
    } else {
      console.log("  ℹ️  Column 'email' already exists, skipping");
    }

    if (!columnNames.has("hours_json")) {
      console.log("  📝 Adding hours_json column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN hours_json TEXT
      `);
    } else {
      console.log("  ℹ️  Column 'hours_json' already exists, skipping");
    }

    if (!columnNames.has("neighborhood_description")) {
      console.log("  📝 Adding neighborhood_description column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN neighborhood_description TEXT
      `);
    } else {
      console.log("  ℹ️  Column 'neighborhood_description' already exists, skipping");
    }

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
