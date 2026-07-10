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
  source_kind: string | null;
  instagram_embed_id: number | null;
  instagram_media_key: string | null;
  source_position: number | null;
  source_url: string | null;
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
    sourceKind: (row.source_kind as ImageSetUpload['sourceKind']) ?? null,
    instagramEmbedId: row.instagram_embed_id ?? null,
    instagramMediaKey: row.instagram_media_key ?? null,
    sourcePosition: row.source_position ?? null,
    sourceUrl: row.source_url ?? null,
  } as ImageSetUpload;
}

const SELECT_UPLOAD_COLUMNS = `
  id, entity_id as location_id, imageSets, uploadFormat, created_at,
  staged_source_status, error_message, google_photo_name,
  source_kind, instagram_embed_id, instagram_media_key, source_position, source_url
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
            google_photo_name = $google_photo_name,
            source_kind = $source_kind,
            instagram_embed_id = $instagram_embed_id,
            instagram_media_key = $instagram_media_key,
            source_position = $source_position,
            source_url = $source_url
        WHERE id = $id
      `);

      query.run({
        $id: imageSetUpload.id,
        $imageSets: imageSetUpload.imageSet ? JSON.stringify(imageSetUpload.imageSet) : null,
        $staged_source_status: imageSetUpload.stagedSourceStatus ?? null,
        $error_message: imageSetUpload.errorMessage ?? null,
        $google_photo_name: imageSetUpload.googlePhotoName ?? null,
        $source_kind: imageSetUpload.sourceKind ?? (imageSetUpload.googlePhotoName ? "google" : null),
        $instagram_embed_id: imageSetUpload.instagramEmbedId ?? null,
        $instagram_media_key: imageSetUpload.instagramMediaKey ?? null,
        $source_position: imageSetUpload.sourcePosition ?? null,
        $source_url: imageSetUpload.sourceUrl ?? null,
      });

      return imageSetUpload.id;
    } else {
      // Insert new
      db.query(`
        INSERT INTO uploads (
          entity_id, imageSets, uploadFormat, staged_source_status, error_message, google_photo_name,
          source_kind, instagram_embed_id, instagram_media_key, source_position, source_url
        ) VALUES (
          $location_id, $imageSets, 'imageset', $staged_source_status, $error_message, $google_photo_name,
          $source_kind, $instagram_embed_id, $instagram_media_key, $source_position, $source_url
        )
      `).run({
        $location_id: imageSetUpload.location_id,
        $imageSets: imageSetUpload.imageSet ? JSON.stringify(imageSetUpload.imageSet) : null,
        $staged_source_status: imageSetUpload.stagedSourceStatus ?? null,
        $error_message: imageSetUpload.errorMessage ?? null,
        $google_photo_name: imageSetUpload.googlePhotoName ?? null,
        $source_kind: imageSetUpload.sourceKind ?? (imageSetUpload.googlePhotoName ? "google" : null),
        $instagram_embed_id: imageSetUpload.instagramEmbedId ?? null,
        $instagram_media_key: imageSetUpload.instagramMediaKey ?? null,
        $source_position: imageSetUpload.sourcePosition ?? null,
        $source_url: imageSetUpload.sourceUrl ?? null,
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

export function getUploadsByInstagramEmbedId(embedId: number): Upload[] {
  const db = getDb();
  const rows = db.query(`
    SELECT ${SELECT_UPLOAD_COLUMNS}
    FROM uploads
    WHERE instagram_embed_id = $embedId
    ORDER BY source_position, id
  `).all({ $embedId: embedId }) as UploadDbRow[];
  return rows.map(mapRow);
}

export function getUploadByInstagramItem(embedId: number, mediaKey: string): Upload | null {
  const db = getDb();
  const row = db.query(`
    SELECT ${SELECT_UPLOAD_COLUMNS}
    FROM uploads
    WHERE instagram_embed_id = $embedId AND instagram_media_key = $mediaKey
  `).get({ $embedId: embedId, $mediaKey: mediaKey }) as UploadDbRow | undefined;
  return row ? mapRow(row) : null;
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
