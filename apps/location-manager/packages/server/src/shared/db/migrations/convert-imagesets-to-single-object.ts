import { getDb } from "../client";

/**
 * Migration: Convert imageSets from array to single object
 *
 * This migration converts the imageSets column from storing JSON arrays
 * (with single ImageSet objects) to storing single ImageSet objects directly.
 *
 * Changes:
 * - Converts existing JSON arrays with single elements to single objects
 * - Leaves empty arrays as null/undefined
 * - Preserves existing data integrity
 */
export function convertImageSetsToSingleObject() {
  const db = getDb();

  console.log("Running migration: convert imageSets from array to single object...");

  try {
    // Get all uploads with imageSets data
    const uploads = db.query("SELECT id, imageSets FROM uploads WHERE imageSets IS NOT NULL AND uploadFormat = 'imageset'").all() as Array<{ id: number; imageSets: string }>;

    console.log(`Found ${uploads.length} uploads to migrate`);

    for (const upload of uploads) {
      try {
        const imageSetsArray = JSON.parse(upload.imageSets);

        // Validate that it's an array
        if (!Array.isArray(imageSetsArray)) {
          console.warn(`Upload ${upload.id}: imageSets is not an array, skipping`);
          continue;
        }

        // Check array length
        if (imageSetsArray.length === 0) {
          // Empty array - set to null
          db.run("UPDATE uploads SET imageSets = NULL WHERE id = ?", [upload.id]);
          console.log(`Upload ${upload.id}: converted empty array to null`);
        } else if (imageSetsArray.length === 1) {
          // Single element array - extract the object
          const imageSetObject = imageSetsArray[0];
          db.run("UPDATE uploads SET imageSets = ? WHERE id = ?", [JSON.stringify(imageSetObject), upload.id]);
          console.log(`Upload ${upload.id}: extracted single ImageSet from array`);
        } else {
          // Multiple elements - this shouldn't happen with current code, but log warning
          console.warn(`Upload ${upload.id}: found ${imageSetsArray.length} ImageSets, keeping as array for manual review`);
        }
      } catch (error) {
        console.error(`Failed to migrate upload ${upload.id}:`, error);
        // Continue with other uploads
      }
    }

    console.log("Migration completed successfully: imageSets converted to single objects");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}
