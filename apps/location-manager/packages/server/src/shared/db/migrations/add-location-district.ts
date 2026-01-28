import Database from "bun:sqlite";

/**
 * Migration: Add district column to locations table
 *
 * Adds a district field derived from BigDataCloud's adminLevel 8 data.
 * District represents the official city district (e.g., "Miraflores" in Lima, "Los Mártires" in Bogotá).
 */
export function addLocationDistrict(db: Database): void {
  console.log("🔄 Starting migration: Add district column to locations table");

  try {
    // Check if column already exists
    const columnExists = db.query(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('locations')
      WHERE name = 'district'
    `).get() as { count: number };

    if (columnExists.count > 0) {
      console.log("  ℹ️  Column 'district' already exists, skipping migration");
      return;
    }

    // Add the district column
    console.log("  📝 Adding district column...");
    db.run(`
      ALTER TABLE locations
      ADD COLUMN district TEXT
    `);

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
