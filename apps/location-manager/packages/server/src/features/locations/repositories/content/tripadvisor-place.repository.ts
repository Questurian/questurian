import { getDb } from "@server/shared/db/client";

export interface TripAdvisorPlaceData {
  id?: number;
  location_id: number;
  tripadvisor_place_id: string;
  place_data: Record<string, unknown>;
  created_at?: string;
}

interface TripAdvisorPlaceDbRow {
  id: number;
  location_id: number;
  tripadvisor_place_id: string;
  place_data: string;
  created_at: string;
}

function mapRow(row: TripAdvisorPlaceDbRow): TripAdvisorPlaceData {
  return {
    id: row.id,
    location_id: row.location_id,
    tripadvisor_place_id: row.tripadvisor_place_id,
    place_data: JSON.parse(row.place_data),
    created_at: row.created_at,
  };
}

export function saveTripAdvisorPlace(data: TripAdvisorPlaceData): number | false {
  try {
    const db = getDb();

    // Check if record already exists (upsert logic)
    const existing = db.query(`
      SELECT id FROM tripadvisor_places
      WHERE location_id = $location_id AND tripadvisor_place_id = $tripadvisor_place_id
    `).get({
      $location_id: data.location_id,
      $tripadvisor_place_id: data.tripadvisor_place_id,
    }) as { id: number } | undefined;

    if (existing) {
      // Update existing record
      db.query(`
        UPDATE tripadvisor_places
        SET place_data = $place_data,
            created_at = CURRENT_TIMESTAMP
        WHERE id = $id
      `).run({
        $id: existing.id,
        $place_data: JSON.stringify(data.place_data),
      });
      return existing.id;
    } else {
      // Insert new record
      db.query(`
        INSERT INTO tripadvisor_places (location_id, tripadvisor_place_id, place_data)
        VALUES ($location_id, $tripadvisor_place_id, $place_data)
      `).run({
        $location_id: data.location_id,
        $tripadvisor_place_id: data.tripadvisor_place_id,
        $place_data: JSON.stringify(data.place_data),
      });

      const result = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
      return result.id;
    }
  } catch (error) {
    console.error("Error saving TripAdvisor place data:", error);
    return false;
  }
}

export function getTripAdvisorPlaceByLocationId(locationId: number): TripAdvisorPlaceData | null {
  const db = getDb();
  const row = db.query(`
    SELECT id, location_id, tripadvisor_place_id, place_data, created_at
    FROM tripadvisor_places
    WHERE location_id = $location_id
    ORDER BY created_at DESC
    LIMIT 1
  `).get({ $location_id: locationId }) as TripAdvisorPlaceDbRow | undefined;

  if (!row) return null;
  return mapRow(row);
}

export function getAllTripAdvisorPlacesByLocationId(locationId: number): TripAdvisorPlaceData[] {
  const db = getDb();
  const rows = db.query(`
    SELECT id, location_id, tripadvisor_place_id, place_data, created_at
    FROM tripadvisor_places
    WHERE location_id = $location_id
    ORDER BY created_at DESC
  `).all({ $location_id: locationId }) as TripAdvisorPlaceDbRow[];

  return rows.map(mapRow);
}

export function deleteTripAdvisorPlaceById(id: number): boolean {
  try {
    const db = getDb();
    db.query("DELETE FROM tripadvisor_places WHERE id = $id").run({ $id: id });
    return true;
  } catch (error) {
    console.error("Error deleting TripAdvisor place:", error);
    return false;
  }
}

export function deleteTripAdvisorPlacesByLocationId(locationId: number): boolean {
  try {
    const db = getDb();
    db.query("DELETE FROM tripadvisor_places WHERE location_id = $location_id").run({
      $location_id: locationId,
    });
    return true;
  } catch (error) {
    console.error("Error deleting TripAdvisor places for location:", error);
    return false;
  }
}
