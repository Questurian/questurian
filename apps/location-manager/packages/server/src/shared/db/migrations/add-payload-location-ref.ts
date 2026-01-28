import Database from "bun:sqlite";

/**
 * Migration: Add payload_location_ref to locations table
 *
 * Purpose: Store the Payload CMS location reference (location hierarchy ID) directly
 * in the locations table. This allows us to resolve the locationRef once during
 * location creation ("one and done") instead of resolving it during every sync.
 *
 * Benefits:
 * - Media uploads always have a location reference (no longer optional)
 * - Simpler sync flow (locationRef already available)
 * - Earlier error detection (fails fast if Payload location hierarchy is missing)
 * - Better data consistency (location and locationRef created together)
 */
export function addPayloadLocationRef(db: Database): void {
  console.log("🔄 Starting migration: Add payload_location_ref to locations table");

  try {
    // Check if column already exists
    const columnExists = db.query(`
      SELECT COUNT(*) as count FROM pragma_table_info('locations')
      WHERE name='payload_location_ref'
    `).get() as { count: number };

    if (columnExists.count > 0) {
      console.log("  ✓ payload_location_ref column already exists (migration already applied)");
      return;
    }

    // Add column to locations table
    console.log("  📝 Adding payload_location_ref column to locations table...");
    db.run(`
      ALTER TABLE locations
      ADD COLUMN payload_location_ref TEXT
    `);

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
