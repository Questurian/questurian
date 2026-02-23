import { getDb } from "@server/shared/db/client";

export function bulkUpdateLocationKeys(
  incorrectValue: string,
  correctValue: string,
  partType: "country" | "city" | "neighborhood"
): number {
  const db = getDb();
  let likePattern: string;

  if (partType === "country") {
    likePattern = `${incorrectValue}%`;
  } else if (partType === "city") {
    likePattern = `%|${incorrectValue}%`;
  } else {
    likePattern = `%|${incorrectValue}`;
  }

  try {
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
