import type { Database } from "bun:sqlite";
import { getDb } from "@server/shared/db/client";
import { threeSegmentLocationKeySqlPredicate } from "../taxonomy/location-hierarchy/bulk.utils";

export function bulkUpdateLocationKeys(
  incorrectValue: string,
  correctValue: string,
  partType: "country" | "city" | "neighborhood",
  database?: Database
): number {
  const db = database ?? getDb();
  let likePattern: string;

  if (partType === "country") {
    likePattern = `${incorrectValue}%`;
  } else if (partType === "city") {
    likePattern = `%|${incorrectValue}%`;
  } else {
    likePattern = `%|${incorrectValue}`;
  }

  try {
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
  } catch (error) {
    console.error("Error bulk updating location keys:", error);
    return 0;
  }
}
