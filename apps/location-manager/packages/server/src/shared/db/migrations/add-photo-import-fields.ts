import type { Database } from "bun:sqlite";

/**
 * Adds Photo Import flow fields:
 * - uploads.staged_source_status: 'downloading' | 'ready' | 'failed' | NULL
 *   NULL means a normal operator upload (not from Photo Import).
 * - uploads.error_message: failure reason when staged_source_status='failed'.
 * - uploads.google_photo_name: Google Place Photo resource name (e.g. "places/X/photos/Y"),
 *   tracked so re-pulls can skip already-imported photos.
 * - entities.rejected_google_photo_names: JSON array of Google photo resource names
 *   the operator has explicitly rejected for this Location.
 */
export function addPhotoImportFields(db: Database): void {
  const uploadCols = db
    .query("PRAGMA table_info(uploads)")
    .all() as Array<{ name: string }>;

  if (!uploadCols.some((c) => c.name === "staged_source_status")) {
    db.run(`ALTER TABLE uploads ADD COLUMN staged_source_status TEXT`);
  }

  if (!uploadCols.some((c) => c.name === "error_message")) {
    db.run(`ALTER TABLE uploads ADD COLUMN error_message TEXT`);
  }

  if (!uploadCols.some((c) => c.name === "google_photo_name")) {
    db.run(`ALTER TABLE uploads ADD COLUMN google_photo_name TEXT`);
  }

  const entityCols = db
    .query("PRAGMA table_info(entities)")
    .all() as Array<{ name: string }>;

  if (!entityCols.some((c) => c.name === "rejected_google_photo_names")) {
    db.run(`ALTER TABLE entities ADD COLUMN rejected_google_photo_names TEXT`);
  }
}
