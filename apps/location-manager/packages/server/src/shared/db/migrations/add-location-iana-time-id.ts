import Database from "bun:sqlite";

/**
 * Migration: Add iana_time_id column to locations table
 *
 * Adds a timezone field (IANA time zone ID) for each location.
 */
export function addLocationIanaTimeId(db: Database): void {
  console.log("🔄 Starting migration: Add iana_time_id column to locations table");

  try {
    const tableInfo = db.query("PRAGMA table_info('locations')").all() as Array<{ name: string }>;
    const hasIanaTimeId = tableInfo.some(col => col.name === "iana_time_id");

    if (hasIanaTimeId) {
      console.log("  ⏭️  Column iana_time_id already exists, skipping migration");
      return;
    }

    console.log("  📝 Adding iana_time_id column...");
    db.run(`
      ALTER TABLE locations
      ADD COLUMN iana_time_id TEXT
    `);

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
