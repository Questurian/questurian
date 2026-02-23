import { getDb } from "@server/shared/db/client";
import type { TaxonomyPartType } from "./types";
import {
  buildTaxonomyLikePattern,
  buildTaxonomyPartColumnUpdate,
} from "./bulk.utils";

export function deduplicatePendingTaxonomy(
  incorrectValue: string,
  correctValue: string,
  partType: TaxonomyPartType
): number {
  const db = getDb();
  const likePattern = buildTaxonomyLikePattern(incorrectValue, partType);

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
      $pattern: likePattern,
    });

    return result.changes;
  } catch (error) {
    console.error("Error deduplicating pending taxonomy:", error);
    return 0;
  }
}

export function bulkUpdatePendingTaxonomy(
  incorrectValue: string,
  correctValue: string,
  partType: TaxonomyPartType
): number {
  const db = getDb();
  const likePattern = buildTaxonomyLikePattern(incorrectValue, partType);
  const partColumnUpdate = buildTaxonomyPartColumnUpdate(partType);

  try {
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
  } catch (error) {
    console.error("Error bulk updating pending taxonomy:", error);
    return 0;
  }
}
