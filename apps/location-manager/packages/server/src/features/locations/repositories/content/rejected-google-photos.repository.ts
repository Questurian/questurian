import { getDb } from "@server/shared/db/client";

/**
 * Per-Location list of Google photo resource names the operator has rejected.
 * See LM CONTEXT.md "Rejected Source".
 */

export function getRejectedGooglePhotoNames(locationId: number): string[] {
  const db = getDb();
  const row = db
    .query("SELECT rejected_google_photo_names FROM entities WHERE id = $id")
    .get({ $id: locationId }) as { rejected_google_photo_names: string | null } | undefined;

  if (!row || !row.rejected_google_photo_names) return [];
  try {
    const parsed = JSON.parse(row.rejected_google_photo_names);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function addRejectedGooglePhoto(locationId: number, photoName: string): void {
  const current = getRejectedGooglePhotoNames(locationId);
  if (current.includes(photoName)) return;
  const next = [...current, photoName];
  writeRejected(locationId, next);
}

export function removeRejectedGooglePhoto(locationId: number, photoName: string): void {
  const current = getRejectedGooglePhotoNames(locationId);
  if (!current.includes(photoName)) return;
  const next = current.filter((n) => n !== photoName);
  writeRejected(locationId, next);
}

function writeRejected(locationId: number, names: string[]): void {
  const db = getDb();
  db.query(
    "UPDATE entities SET rejected_google_photo_names = $value WHERE id = $id"
  ).run({
    $id: locationId,
    $value: names.length > 0 ? JSON.stringify(names) : null,
  });
}
