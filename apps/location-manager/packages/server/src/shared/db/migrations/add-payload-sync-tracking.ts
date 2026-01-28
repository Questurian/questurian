import Database from "bun:sqlite";

/**
 * Migration: Create payload_sync_state table
 *
 * Tracks sync state between url-util locations and Payload CMS documents:
 * - Stores Payload document IDs for synced locations
 * - Tracks last sync timestamp
 * - Records sync status (success, failed, pending)
 * - Supports one-way sync from url-util to Payload
 */
export function addPayloadSyncTracking(db: Database): void {
  console.log("🔄 Starting migration: Create payload_sync_state table");

  try {
    // Check if table already exists
    const tableExists = db.query(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='payload_sync_state'
    `).get();

    if (tableExists) {
      console.log("  ✓ payload_sync_state table already exists (migration already applied)");
      return;
    }

    // Create payload_sync_state table
    console.log("  📝 Creating payload_sync_state table...");
    db.run(`
      CREATE TABLE payload_sync_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id INTEGER NOT NULL,
        payload_collection TEXT NOT NULL CHECK(payload_collection IN ('dining', 'accommodations', 'attractions', 'nightlife')),
        payload_doc_id TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'success' CHECK(sync_status IN ('success', 'failed', 'pending')),
        error_message TEXT,
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
        UNIQUE(location_id, payload_collection)
      )
    `);

    // Create index for efficient lookups by location_id
    console.log("  🔍 Creating index on location_id...");
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_payload_sync_location
      ON payload_sync_state(location_id)
    `);

    // Create index for efficient filtering by sync status
    console.log("  🔍 Creating index on sync_status...");
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_payload_sync_status
      ON payload_sync_state(sync_status)
    `);

    // Create index for filtering by collection
    console.log("  🔍 Creating index on payload_collection...");
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_payload_sync_collection
      ON payload_sync_state(payload_collection)
    `);

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
