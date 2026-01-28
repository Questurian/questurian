import { getDb } from "../client";

/**
 * Migration: Add imageSets and uploadFormat columns to uploads table
 *
 * This migration enables the multi-variant image system while maintaining
 * backward compatibility with existing single-image uploads.
 *
 * Changes:
 * - Adds `imageSets` TEXT column to store JSON ImageSet object
 * - Adds `uploadFormat` TEXT column to discriminate between 'legacy' and 'imageset' formats
 * - Sets default uploadFormat='legacy' for all existing rows
 */
export function migrateToImageSets() {
  const db = getDb();

  // Check if imageSets column already exists
  const tableInfo = db.query("PRAGMA table_info(uploads)").all() as any[];
  const hasImageSets = tableInfo.some(col => col.name === 'imageSets');
  const hasUploadFormat = tableInfo.some(col => col.name === 'uploadFormat');

  if (hasImageSets && hasUploadFormat) {
    console.log("imageSets migration already applied, skipping");
    return;
  }

  console.log("Running migration: add imageSets and uploadFormat columns to uploads table...");

  try {
    // Add imageSets column if it doesn't exist
    if (!hasImageSets) {
      db.run("ALTER TABLE uploads ADD COLUMN imageSets TEXT");
      console.log("  ✓ Added imageSets column");
    }

    // Add uploadFormat column if it doesn't exist
    if (!hasUploadFormat) {
      db.run("ALTER TABLE uploads ADD COLUMN uploadFormat TEXT DEFAULT 'legacy'");
      console.log("  ✓ Added uploadFormat column");

      // Set uploadFormat='legacy' for all existing rows (in case DEFAULT didn't apply)
      db.run("UPDATE uploads SET uploadFormat = 'legacy' WHERE uploadFormat IS NULL");
      console.log("  ✓ Set uploadFormat='legacy' for existing rows");
    }

    console.log("Migration completed successfully: imageSets columns added");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}
