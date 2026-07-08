import type { Database } from "bun:sqlite";
import { getDb } from "@server/shared/db/client";
import type { TaxonomyPartType } from "./types";
import {
  buildTaxonomyLikePattern,
  buildTaxonomyPartColumnUpdate,
  threeSegmentLocationKeySqlPredicate,
} from "./bulk.utils";

/**
 * Retroactive half of a CorrectionRule: bulk-rewrite every matching row in
 * location_taxonomy (pending entries) and entities. All three functions run
 * inside the caller's transaction and throw on failure so a partial apply
 * rolls back — an applied rule must update all matching rows, or none.
 */

export function deduplicatePendingTaxonomy(
  incorrectValue: string,
  correctValue: string,
  partType: TaxonomyPartType,
  database?: Database
): number {
  const db = database ?? getDb();
  const likePattern = buildTaxonomyLikePattern(incorrectValue, partType);
  const seg = threeSegmentLocationKeySqlPredicate();

  if (partType === "neighborhood") {
    const query = db.query(`
      WITH corrected_keys AS (
        SELECT
          id,
          substr(locationKey, 1, LENGTH(locationKey) - LENGTH($incorrectValue)) || $correctValue as new_key,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY substr(locationKey, 1, LENGTH(locationKey) - LENGTH($incorrectValue)) || $correctValue
            ORDER BY created_at ASC
          ) as rn
        FROM location_taxonomy
        WHERE status = 'pending' AND locationKey LIKE $pattern AND ${seg}
      )
      DELETE FROM location_taxonomy
      WHERE id IN (SELECT id FROM corrected_keys WHERE rn > 1)
    `);

    const result = query.run({
      $incorrectValue: incorrectValue,
      $correctValue: correctValue,
      $pattern: likePattern,
    });

    return result.changes;
  }

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
    $pattern: likePattern,
  });

  return result.changes;
}

export function bulkUpdatePendingTaxonomy(
  incorrectValue: string,
  correctValue: string,
  partType: TaxonomyPartType,
  database?: Database
): number {
  const db = database ?? getDb();
  const likePattern = buildTaxonomyLikePattern(incorrectValue, partType);
  const partColumnUpdate = buildTaxonomyPartColumnUpdate(partType);
  const seg = threeSegmentLocationKeySqlPredicate();

  if (partType === "neighborhood") {
    const sql = `
      UPDATE location_taxonomy
      SET
        ${partColumnUpdate}
        locationKey = substr(locationKey, 1, LENGTH(locationKey) - LENGTH($incorrectValue)) || $correctValue
      WHERE status = 'pending' AND locationKey LIKE $pattern AND ${seg}
    `;

    const query = db.query(sql);
    const result = query.run({
      $incorrectValue: incorrectValue,
      $correctValue: correctValue,
      $pattern: likePattern,
    });

    return result.changes;
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
    $pattern: likePattern,
  });

  return result.changes;
}

export function bulkUpdateLocationKeys(
  incorrectValue: string,
  correctValue: string,
  partType: TaxonomyPartType,
  database?: Database
): number {
  const db = database ?? getDb();
  const likePattern = buildTaxonomyLikePattern(incorrectValue, partType);

  if (partType === "neighborhood") {
    const query = db.query(`
      UPDATE entities
      SET locationKey = substr(locationKey, 1, LENGTH(locationKey) - LENGTH($incorrectValue)) || $correctValue
      WHERE locationKey LIKE $pattern
        AND ${threeSegmentLocationKeySqlPredicate()}
    `);
    const result = query.run({
      $incorrectValue: incorrectValue,
      $correctValue: correctValue,
      $pattern: likePattern,
    });
    return result.changes;
  }

  const query = db.query(`
    UPDATE entities
    SET locationKey = REPLACE(locationKey, $incorrectValue, $correctValue)
    WHERE locationKey LIKE $pattern
  `);

  const result = query.run({
    $incorrectValue: incorrectValue,
    $correctValue: correctValue,
    $pattern: likePattern,
  });

  return result.changes;
}
