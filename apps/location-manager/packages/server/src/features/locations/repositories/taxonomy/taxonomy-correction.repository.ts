import { getDb } from "@server/shared/db/client";

export interface TaxonomyCorrection {
  id?: number;
  incorrect_value: string;
  correct_value: string;
  part_type: "country" | "city" | "neighborhood";
  created_at?: string;
}

/**
 * Get all active correction rules
 */
export function getAllCorrections(): TaxonomyCorrection[] {
  const db = getDb();
  const query = db.query(`
    SELECT id, incorrect_value, correct_value, part_type, created_at
    FROM taxonomy_corrections
    ORDER BY created_at DESC
  `);
  return query.all() as TaxonomyCorrection[];
}

/**
 * Find correction for a specific value and part type
 */
export function findCorrection(
  value: string,
  partType: "country" | "city" | "neighborhood"
): TaxonomyCorrection | null {
  const db = getDb();
  const query = db.query(`
    SELECT id, incorrect_value, correct_value, part_type, created_at
    FROM taxonomy_corrections
    WHERE incorrect_value = $value AND part_type = $partType
  `);
  const result = query.get({
    $value: value,
    $partType: partType,
  }) as TaxonomyCorrection | null;
  return result;
}

/**
 * Insert a new correction rule
 */
export function insertCorrection(
  incorrectValue: string,
  correctValue: string,
  partType: "country" | "city" | "neighborhood"
): TaxonomyCorrection | null {
  const db = getDb();

  try {
    const query = db.query(`
      INSERT INTO taxonomy_corrections (incorrect_value, correct_value, part_type)
      VALUES ($incorrect, $correct, $partType)
    `);

    query.run({
      $incorrect: incorrectValue,
      $correct: correctValue,
      $partType: partType,
    });

    return findCorrection(incorrectValue, partType);
  } catch (error) {
    console.error("Error inserting correction:", error);
    return null;
  }
}

/**
 * Delete a correction rule by ID
 */
export function deleteCorrection(id: number): boolean {
  const db = getDb();
  try {
    const query = db.query(`DELETE FROM taxonomy_corrections WHERE id = $id`);
    const result = query.run({ $id: id });
    return result.changes > 0;
  } catch (error) {
    console.error("Error deleting correction:", error);
    return false;
  }
}

/**
 * Get correction by ID
 */
export function getCorrectionById(id: number): TaxonomyCorrection | null {
  const db = getDb();
  const query = db.query(`
    SELECT id, incorrect_value, correct_value, part_type, created_at
    FROM taxonomy_corrections
    WHERE id = $id
  `);
  return query.get({ $id: id }) as TaxonomyCorrection | null;
}

/**
 * Find all pending taxonomy entries that contain a specific value
 * @param incorrectValue - The value to search for
 * @param partType - Which part of the locationKey to match (country/city/neighborhood)
 * @returns Array of pending taxonomy entries that would be affected
 */
export function findAffectedPendingTaxonomy(
  incorrectValue: string,
  partType: "country" | "city" | "neighborhood"
): Array<{ locationKey: string; country: string; city: string; neighborhood: string }> {
  const db = getDb();

  // Build LIKE pattern based on part type
  let likePattern: string;
  if (partType === "country") {
    likePattern = `${incorrectValue}%`; // Start of locationKey
  } else if (partType === "city") {
    likePattern = `%|${incorrectValue}%`; // Middle or end part (after first pipe)
  } else {
    // neighborhood
    likePattern = `%|${incorrectValue}`; // End part only
  }

  const query = db.query(`
    SELECT locationKey, country, city, neighborhood
    FROM location_taxonomy
    WHERE status = 'pending' AND locationKey LIKE $pattern
    ORDER BY created_at ASC
    LIMIT 5
  `);

  return query.all({ $pattern: likePattern }) as Array<{
    locationKey: string;
    country: string;
    city: string;
    neighborhood: string;
  }>;
}

/**
 * Count locations with locationKeys containing a specific value
 * @param incorrectValue - The value to search for
 * @param partType - Which part of the locationKey to match
 * @returns Count of affected locations
 */
export function countAffectedLocations(
  incorrectValue: string,
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

  const query = db.query(`
    SELECT COUNT(*) as count
    FROM locations
    WHERE locationKey LIKE $pattern
  `);

  const result = query.get({ $pattern: likePattern }) as { count: number } | null;
  return result?.count || 0;
}

/**
 * Find sample locations that would be affected by a correction
 * @param incorrectValue - The value to search for
 * @param partType - Which part of the locationKey to match
 * @returns Array of sample locations (up to 5) with current and corrected keys
 */
export function findAffectedLocationSamples(
  incorrectValue: string,
  correctValue: string,
  partType: "country" | "city" | "neighborhood"
): Array<{ id: number; name: string; currentKey: string; correctedKey: string }> {
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

  const query = db.query(`
    SELECT id, name, locationKey
    FROM locations
    WHERE locationKey LIKE $pattern
    LIMIT 5
  `);

  const results = query.all({ $pattern: likePattern }) as Array<{
    id: number;
    name: string;
    locationKey: string;
  }>;

  // Compute corrected locationKey for each result
  return results.map((row) => ({
    id: row.id,
    name: row.name,
    currentKey: row.locationKey,
    correctedKey: row.locationKey.replace(incorrectValue, correctValue),
  }));
}
