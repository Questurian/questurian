import { getDb } from "@server/shared/db/client";
import type { LocationHierarchy } from "../../../models/location";
import { getTaxonomyEntry } from "./read.repository";

export function insertPendingTaxonomyEntry(
  country: string,
  city: string | null,
  neighborhood: string | null,
  locationKey: string
): LocationHierarchy | null {
  const db = getDb();

  try {
    const query = db.query(`
      INSERT INTO location_taxonomy (country, city, neighborhood, locationKey, status)
      VALUES ($country, $city, $neighborhood, $locationKey, 'pending')
    `);

    query.run({
      $country: country,
      $city: city,
      $neighborhood: neighborhood,
      $locationKey: locationKey,
    });

    return getTaxonomyEntry(locationKey);
  } catch {
    // UNIQUE constraint violation indicates a duplicate entry.
    return null;
  }
}

export function approveTaxonomyEntry(locationKey: string): boolean {
  const db = getDb();

  try {
    const query = db.query(`
      UPDATE location_taxonomy
      SET status = 'approved'
      WHERE locationKey = $locationKey
    `);
    const result = query.run({ $locationKey: locationKey });
    return result.changes > 0;
  } catch (error) {
    console.error("Error approving taxonomy entry:", error);
    return false;
  }
}

export function rejectTaxonomyEntry(locationKey: string): boolean {
  const db = getDb();

  try {
    const query = db.query(`
      DELETE FROM location_taxonomy
      WHERE locationKey = $locationKey AND status = 'pending'
    `);
    const result = query.run({ $locationKey: locationKey });
    return result.changes > 0;
  } catch (error) {
    console.error("Error rejecting taxonomy entry:", error);
    return false;
  }
}
