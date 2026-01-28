import { getDb } from "../client";

/**
 * Migration: Remove unused images and imageMetadata columns from uploads table
 *
 * These fields are redundant for ImageSet uploads and not used in client code.
 */
export function removeUnusedUploadFields(): boolean {
  const db = getDb();

  try {
  console.log("🔄 Starting migration: Remove unused fields from uploads table");

  db.run("BEGIN TRANSACTION");

  // Check if columns still exist
  const tableInfo = db.query("PRAGMA table_info(uploads)").all() as any[];
  const hasImages = tableInfo.some((col) => col.name === "images");
  const hasImageMetadata = tableInfo.some((col) => col.name === "imageMetadata");

  if (!hasImages && !hasImageMetadata) {
    console.log("  ✓ Unused columns already removed (migration already applied)");
    db.run("ROLLBACK");
    return true;
  }

  // Drop uploads_new table if it exists (cleanup from failed previous migrations)
  try {
    db.run(`DROP TABLE IF EXISTS uploads_new`);
  } catch (error) {
    console.log("  ⚠️  Could not drop existing uploads_new table, continuing...");
  }

  // Create new table without the unused columns
  db.run(`
    CREATE TABLE uploads_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      imageSets TEXT,  -- Stores single ImageSet object as JSON
      uploadFormat TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE
    )
  `);

    // Copy data from old table to new table, only keeping needed columns
    db.run(`
      INSERT INTO uploads_new (id, location_id, imageSets, uploadFormat, created_at)
      SELECT id, location_id, imageSets, uploadFormat, created_at
      FROM uploads
    `);

    // Drop old table
    db.run("DROP TABLE uploads");

    // Rename new table to original name
    db.run("ALTER TABLE uploads_new RENAME TO uploads");

    // Recreate the index if it exists
    try {
      db.run("CREATE INDEX IF NOT EXISTS idx_uploads_location_id ON uploads(location_id)");
    } catch (error) {
      console.log("  ⚠️  Could not recreate index, continuing...");
    }

    db.run("COMMIT");
    console.log("  ✅ Migration completed successfully");
    console.log("     - Removed images column from uploads table");
    console.log("     - Removed imageMetadata column from uploads table");

    return true;
  } catch (error) {
    db.run("ROLLBACK");
    console.error("  ❌ Migration failed:", error);
    return false;
  }
}
