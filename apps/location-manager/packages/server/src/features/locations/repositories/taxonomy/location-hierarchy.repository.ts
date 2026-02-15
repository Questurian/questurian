import { getDb } from "@server/shared/db/client";
import type { LocationHierarchy, CountryData, CityData, NeighborhoodData } from "../../models/location";
import {
  getCountries as extractCountries,
  isLocationInScope,
  buildNestedHierarchy
} from "../../utils/location-utils";
import { formatLocationName } from "@questurian/lm-shared";

/**
 * Database row interface for location_taxonomy table
 */
interface LocationHierarchyDbRow {
  id: number;
  country: string;
  city: string | null;
  neighborhood: string | null;
  locationKey: string;
  status?: string;
  created_at?: string;
}

/**
 * Get all location hierarchy entries (approved only)
 */
export function getAllLocationHierarchy(): LocationHierarchy[] {
  const db = getDb();
  const query = db.query(`
    SELECT id, country, city, neighborhood, locationKey
    FROM location_taxonomy
    WHERE status = 'approved'
    ORDER BY locationKey
  `);
  return query.all() as LocationHierarchy[];
}

/**
 * Get all countries (location entries where city and neighborhood are null)
 */
export function getCountries(): LocationHierarchy[] {
  const allLocations = getAllLocationHierarchy();
  return extractCountries(allLocations);
}

/**
 * Get all countries with nested cities and neighborhoods
 * Returns the hierarchical structure expected by the API
 */
export function getCountriesNested(): CountryData[] {
  const allLocations = getAllLocationHierarchy();
  return buildNestedHierarchy(allLocations);
}

/**
 * Get cities for a country with nested neighborhoods
 */
export function getCitiesNestedByCountry(country: string): CityData[] {
  const allLocations = getAllLocationHierarchy();
  const countryData = buildNestedHierarchy(allLocations).find(c => c.code.toLowerCase() === country.toLowerCase() || c.label.toLowerCase() === country.toLowerCase());
  return countryData?.cities || [];
}

/**
 * Get neighborhoods for a specific country and city
 */
export function getNeighborhoodsNested(country: string, city: string): NeighborhoodData[] {
  const cities = getCitiesNestedByCountry(country);
  const cityData = cities.find(c => c.value === city);
  return cityData?.neighborhoods || [];
}

/**
 * Check if a locationKey exists in taxonomy (any status)
 */
export function taxonomyEntryExists(locationKey: string): boolean {
  const db = getDb();
  const query = db.query(`
    SELECT COUNT(*) as count
    FROM location_taxonomy
    WHERE locationKey = $locationKey
  `);
  const result = query.get({ $locationKey: locationKey }) as { count: number };
  return result.count > 0;
}

/**
 * Get a taxonomy entry by locationKey
 */
export function getTaxonomyEntry(locationKey: string): LocationHierarchy | null {
  const db = getDb();
  const query = db.query(`
    SELECT id, country, city, neighborhood, locationKey, status, created_at
    FROM location_taxonomy
    WHERE locationKey = $locationKey
  `);
  const row = query.get({ $locationKey: locationKey }) as LocationHierarchyDbRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    country: row.country,
    city: row.city,
    neighborhood: row.neighborhood,
    locationKey: row.locationKey,
    status: row.status as 'approved' | 'pending' | undefined,
    created_at: row.created_at
  };
}

/**
 * Insert a new pending taxonomy entry
 * Returns the inserted entry or null if duplicate
 */
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
      $locationKey: locationKey
    });

    return getTaxonomyEntry(locationKey);
  } catch (error) {
    // UNIQUE constraint violation - entry already exists
    return null;
  }
}

/**
 * Approve a taxonomy entry by locationKey
 */
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

/**
 * Reject (delete) a taxonomy entry by locationKey
 */
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

/**
 * Get all pending taxonomy entries for admin review
 */
export function getPendingTaxonomyEntries(): LocationHierarchy[] {
  const db = getDb();
  const query = db.query(`
    SELECT id, country, city, neighborhood, locationKey, created_at
    FROM location_taxonomy
    WHERE status = 'pending'
    ORDER BY created_at DESC
  `);
  const rows = query.all() as LocationHierarchyDbRow[];
  return rows.map(row => ({
    id: row.id,
    country: row.country,
    city: row.city,
    neighborhood: row.neighborhood,
    locationKey: row.locationKey,
    status: 'pending' as const,
    created_at: row.created_at
  }));
}

/**
 * Get count of locations using a specific locationKey
 */
export function getLocationCountByTaxonomy(locationKey: string): number {
  const db = getDb();
  const query = db.query(`
    SELECT COUNT(*) as count
    FROM locations
    WHERE locationKey = $locationKey
  `);
  const result = query.get({ $locationKey: locationKey }) as { count: number };
  return result.count;
}

/**
 * Remove duplicate pending taxonomy entries before bulk update.
 *
 * Duplicates can occur when multiple locations are created simultaneously
 * with the same locationKey, or when bulk corrections would create
 * multiple pending entries with identical corrected locationKeys.
 *
 * This function identifies entries that would have the same locationKey
 * after applying the correction (replacing incorrectValue with correctValue)
 * and removes all but the oldest entry (by created_at timestamp).
 *
 * @param incorrectValue - The incorrect value to be replaced in locationKey
 * @param correctValue - The correct value to replace it with
 * @param partType - Which part of the location hierarchy to target (country, city, or neighborhood)
 * @returns Count of deleted duplicate entries
 *
 * @example
 * // Before: ["colombia|bogotá", "colombia|bogotá", "colombia|bogota"]
 * deduplicatePendingTaxonomy("bogotá", "bogota", "city");
 * // After: ["colombia|bogotá"] (oldest entry kept, 2 deleted)
 * // Returns: 2
 */
export function deduplicatePendingTaxonomy(
  incorrectValue: string,
  correctValue: string,
  partType: "country" | "city" | "neighborhood"
): number {
  const db = getDb();

  // Build LIKE pattern based on part type
  let likePattern: string;
  if (partType === "country") {
    likePattern = `${incorrectValue}%`;
  } else if (partType === "city") {
    likePattern = `%|${incorrectValue}%`;
  } else {
    // neighborhood
    likePattern = `%|${incorrectValue}`;
  }

  try {
    const query = db.query(`
      WITH corrected_keys AS (
        SELECT
          id,
          REPLACE(locationKey, $incorrectValue, $correctValue) as new_key,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY REPLACE(locationKey, $incorrectValue, $correctValue)
            ORDER BY created_at ASC
          ) as rn
        FROM location_taxonomy
        WHERE status = 'pending' AND locationKey LIKE $pattern
      )
      DELETE FROM location_taxonomy
      WHERE id IN (SELECT id FROM corrected_keys WHERE rn > 1)
    `);

    const result = query.run({
      $incorrectValue: incorrectValue,
      $correctValue: correctValue,
      $pattern: likePattern
    });

    return result.changes;
  } catch (error) {
    console.error("Error deduplicating pending taxonomy:", error);
    return 0;
  }
}

/**
 * Update all pending taxonomy entries by replacing a value in locationKey.
 *
 * This function performs a bulk correction on pending taxonomy entries,
 * replacing an incorrect value with a correct value in the locationKey.
 * It also updates the corresponding column (country, city, or neighborhood)
 * to maintain data consistency.
 *
 * Should be called after deduplicatePendingTaxonomy() to prevent
 * creating duplicate entries with the same corrected locationKey.
 *
 * @param incorrectValue - The incorrect value to be replaced
 * @param correctValue - The correct value to replace it with
 * @param partType - Which part of the location hierarchy to target (country, city, or neighborhood)
 * @returns Count of updated entries
 *
 * @example
 * // Fix misspelled city name in all pending entries
 * bulkUpdatePendingTaxonomy("bogotá", "bogota", "city");
 * // Updates: "colombia|bogotá|chapinero" → "colombia|bogota|chapinero"
 * // Also updates the city column from "bogotá" to "bogota"
 */
export function bulkUpdatePendingTaxonomy(
  incorrectValue: string,
  correctValue: string,
  partType: "country" | "city" | "neighborhood"
): number {
  const db = getDb();

  // Build LIKE pattern based on part type
  let likePattern: string;
  if (partType === "country") {
    likePattern = `${incorrectValue}%`;
  } else if (partType === "city") {
    likePattern = `%|${incorrectValue}%`;
  } else {
    // neighborhood
    likePattern = `%|${incorrectValue}`;
  }

  try {
    // Build dynamic SET clause for the part column
    let partColumnUpdate = "";
    if (partType === "country") {
      partColumnUpdate = "country = CASE WHEN country = $incorrectValue THEN $correctValue ELSE country END,";
    } else if (partType === "city") {
      partColumnUpdate = "city = CASE WHEN city = $incorrectValue THEN $correctValue ELSE city END,";
    } else {
      partColumnUpdate = "neighborhood = CASE WHEN neighborhood = $incorrectValue THEN $correctValue ELSE neighborhood END,";
    }

    const sql = `
      UPDATE location_taxonomy
      SET
        ${partColumnUpdate}
        locationKey = REPLACE(locationKey, $incorrectValue, $correctValue)
      WHERE status = 'pending' AND locationKey LIKE $pattern
    `;

    const query = db.query(sql);
    const result = query.run({
      $incorrectValue: incorrectValue,
      $correctValue: correctValue,
      $pattern: likePattern
    });

    return result.changes;
  } catch (error) {
    console.error("Error bulk updating pending taxonomy:", error);
    return 0;
  }
}
