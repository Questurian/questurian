import Database from "bun:sqlite";

/**
 * Migration: Add status column to location_taxonomy table
 *
 * Adds approval workflow to location taxonomy:
 * - 'approved': Visible in public filters, can be assigned to locations
 * - 'pending': Awaiting admin review, hidden from public filters
 */
export function addTaxonomyStatus(db: Database): void {
  console.log("🔄 Starting migration: Add status to location_taxonomy");

  try {
    // Check if status column already exists
    const tableInfo = db.query("PRAGMA table_info(location_taxonomy)").all() as Array<{ name: string }>;
    const hasStatusColumn = tableInfo.some(col => col.name === 'status');

    if (hasStatusColumn) {
      console.log("  ✓ Status column already exists (migration already applied)");
      return;
    }

    // Step 1: Add status column with default 'approved' for existing data
    console.log("  📝 Adding status column...");
    db.run(`
      ALTER TABLE location_taxonomy
      ADD COLUMN status TEXT DEFAULT 'approved' CHECK(status IN ('approved', 'pending'))
    `);

    // Step 2: Mark all existing seeded data as approved
    console.log("  ✅ Marking existing taxonomy entries as approved...");
    db.run(`UPDATE location_taxonomy SET status = 'approved'`);

    // Step 3: Add composite index for efficient filtering
    console.log("  🔍 Creating index on (status, locationKey)...");
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_taxonomy_status_key
      ON location_taxonomy(status, locationKey)
    `);

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
