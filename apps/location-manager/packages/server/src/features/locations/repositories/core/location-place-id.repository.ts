import type { Database } from "bun:sqlite";
import { getDb } from "@server/shared/db/client";
import type { LocationCategory } from "../../models/location";

export interface PlaceIdLocationRow {
  id: number;
  name: string;
  category: LocationCategory;
  placeId: string;
}

/**
 * Every location holding one of these Google Place IDs.
 *
 * Several rows can share a Place ID -- nothing in the schema stops it, and the
 * live data has pairs -- so this returns all of them rather than picking one.
 * The database is a parameter so the query can be tested against a real
 * in-memory SQLite without registering a process-global module mock.
 */
export function findLocationsByPlaceIds(
  placeIds: string[],
  db: Database = getDb()
): PlaceIdLocationRow[] {
  const unique = [...new Set(placeIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const params: Record<string, string> = {};
  const placeholders = unique.map((id, index) => {
    params[`$p${index}`] = id;
    return `$p${index}`;
  });

  return db
    .query(
      `SELECT id, name, category, place_id AS placeId
         FROM entities
        WHERE place_id IN (${placeholders.join(", ")})
        ORDER BY id`
    )
    .all(params) as PlaceIdLocationRow[];
}
