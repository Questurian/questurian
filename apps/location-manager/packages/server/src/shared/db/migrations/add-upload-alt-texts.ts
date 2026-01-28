import { getDb } from "../client";

/**
 * Migration: Add altTexts column to uploads table
 *
 * Stores AI-generated alt text for each uploaded image as a JSON array
 * parallel to the images array (for legacy uploads) or within ImageSets
 */
export function addUploadAltTexts(): boolean {
  const db = getDb();

  try {
    console.log("🔄 Starting migration: Add altTexts to uploads table");

    db.run("BEGIN TRANSACTION");

    // Check if column already exists
    const tableInfo = db.query("PRAGMA table_info(uploads)").all() as any[];
    const columnExists = tableInfo.some((col) => col.name === "altTexts");

    if (columnExists) {
      console.log("  ✓ altTexts column already exists (migration already applied)");
      db.run("ROLLBACK");
      return true;
    }

    // Add altTexts column
    db.run(`
      ALTER TABLE uploads
      ADD COLUMN altTexts TEXT
    `);

    db.run("COMMIT");
    console.log("  ✅ Migration completed successfully");
    console.log("     - Added altTexts column to uploads table");

    return true;
  } catch (error) {
    db.run("ROLLBACK");
    console.error("  ❌ Migration failed:", error);
    return false;
  }
}


