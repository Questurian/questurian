import { getDb } from "@server/shared/db/client";
import type { Upload, ImageSetUpload } from "../../models/location";

/**
 * Database row interface for uploads table
 */
interface UploadDbRow {
  id: number;
  location_id: number;
  // images: string | null; // REMOVED: Column no longer exists
  // imageMetadata: string | null; // REMOVED: Column no longer exists
  imageSets: string | null;
  uploadFormat: string;
  created_at: string;
  staged_source_status: string | null;
  error_message: string | null;
  google_photo_name: string | null;
}

/**
 * Maps a database row to ImageSetUpload format
 * All uploads are now stored in ImageSet format
 */
function mapRow(row: UploadDbRow): Upload {
  return {
    id: row.id,
    location_id: row.location_id,
    imageSet: row.imageSets ? JSON.parse(row.imageSets) : undefined,
    format: 'imageset',
    created_at: row.created_at,
    stagedSourceStatus: (row.staged_source_status as ImageSetUpload['stagedSourceStatus']) ?? null,
    errorMessage: row.error_message ?? null,
    googlePhotoName: row.google_photo_name ?? null,
  } as ImageSetUpload;
}

const SELECT_UPLOAD_COLUMNS = `
  id, entity_id as location_id, imageSets, uploadFormat, created_at,
  staged_source_status, error_message, google_photo_name
`;

/**
 * Saves an ImageSetUpload to the database
 * Returns the upload ID on success, or false on failure
 */
export function saveUpload(upload: Upload): number | boolean {
  try {
    const db = getDb();
    const imageSetUpload = upload as ImageSetUpload;

    if (imageSetUpload.id) {
      // Update existing
      const query = db.query(`
        UPDATE uploads
        SET imageSets = $imageSets,
            uploadFormat = 'imageset',
            staged_source_status = $staged_source_status,
            error_message = $error_message,
            google_photo_name = $google_photo_name
        WHERE id = $id
      `);

      query.run({
        $id: imageSetUpload.id,
        $imageSets: imageSetUpload.imageSet ? JSON.stringify(imageSetUpload.imageSet) : null,
        $staged_source_status: imageSetUpload.stagedSourceStatus ?? null,
        $error_message: imageSetUpload.errorMessage ?? null,
        $google_photo_name: imageSetUpload.googlePhotoName ?? null,
      });

      return imageSetUpload.id;
    } else {
      // Insert new
      db.query(`
        INSERT INTO uploads (entity_id, imageSets, uploadFormat, staged_source_status, error_message, google_photo_name)
        VALUES ($location_id, $imageSets, 'imageset', $staged_source_status, $error_message, $google_photo_name)
      `).run({
        $location_id: imageSetUpload.location_id,
        $imageSets: imageSetUpload.imageSet ? JSON.stringify(imageSetUpload.imageSet) : null,
        $staged_source_status: imageSetUpload.stagedSourceStatus ?? null,
        $error_message: imageSetUpload.errorMessage ?? null,
        $google_photo_name: imageSetUpload.googlePhotoName ?? null,
      });

      const result = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
      return result.id;
    }
  } catch (error) {
    console.error("Error saving upload to DB:", error);
    return false;
  }
}

export function getUploadById(id: number): Upload | null {
  const db = getDb();
  const query = db.query(`
    SELECT ${SELECT_UPLOAD_COLUMNS}
    FROM uploads
    WHERE id = $id
  `);
  const row = query.get({ $id: id }) as UploadDbRow | undefined;
  if (!row) return null;
  return mapRow(row);
}

export function getUploadsByLocationId(locationId: number): Upload[] {
  const db = getDb();
  const query = db.query(`
    SELECT ${SELECT_UPLOAD_COLUMNS}
    FROM uploads
    WHERE entity_id = $locationId
    ORDER BY created_at DESC
  `);
  const rows = query.all({ $locationId: locationId }) as UploadDbRow[];
  return rows.map(mapRow);
}

/**
 * Efficiently fetch uploads for multiple location IDs
 * Returns a Map of location_id -> Upload[] for O(1) lookup
 * This prevents N+1 query problems when fetching multiple locations
 */
export function getUploadsByLocationIds(locationIds: number[]): Map<number, Upload[]> {
  if (locationIds.length === 0) {
    return new Map();
  }

  const db = getDb();
  const placeholders = locationIds.map(() => '?').join(',');
  const query = db.query(`
    SELECT ${SELECT_UPLOAD_COLUMNS}
    FROM uploads
    WHERE entity_id IN (${placeholders})
    ORDER BY created_at DESC
  `);

  const rows = query.all(...locationIds) as UploadDbRow[];
  const uploadsByLocation = new Map<number, Upload[]>();

  // Group uploads by location_id
  rows.forEach((row) => {
    const upload = mapRow(row);
    const locationId = upload.location_id!;
    if (!uploadsByLocation.has(locationId)) {
      uploadsByLocation.set(locationId, []);
    }
    uploadsByLocation.get(locationId)!.push(upload);
  });

  return uploadsByLocation;
}

export function deleteUploadById(id: number): boolean {
  try {
    const db = getDb();
    const query = db.query("DELETE FROM uploads WHERE id = $id");
    query.run({ $id: id });
    return true;
  } catch (error) {
    console.error("Error deleting upload:", error);
    return false;
  }
}
