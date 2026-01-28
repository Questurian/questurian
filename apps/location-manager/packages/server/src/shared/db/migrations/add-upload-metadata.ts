import { getDb } from "../client";

/**
 * Migration: Add imageMetadata column to uploads table
 *
 * Stores metadata for each uploaded image (dimensions, size, format)
 * as a JSON array parallel to the images array
 */
export function addUploadMetadata(): boolean {
  const db = getDb();

  try {
    console.log("🔄 Starting migration: Add imageMetadata to uploads table");

    db.run("BEGIN TRANSACTION");

    // Check if column already exists
    const tableInfo = db.query("PRAGMA table_info(uploads)").all() as any[];
    const columnExists = tableInfo.some((col) => col.name === "imageMetadata");

    if (columnExists) {
      console.log("  ✓ imageMetadata column already exists (migration already applied)");
      db.run("ROLLBACK");
      return true;
    }

    // Add imageMetadata column
    db.run(`
      ALTER TABLE uploads
      ADD COLUMN imageMetadata TEXT
    `);

    db.run("COMMIT");
    console.log("  ✅ Migration completed successfully");
    console.log("     - Added imageMetadata column to uploads table");

    return true;
  } catch (error) {
    db.run("ROLLBACK");
    console.error("  ❌ Migration failed:", error);
    return false;
  }
}
