import { getDb } from "@server/shared/db/client";
import type { TaxonomyCorrection, TaxonomyPartType } from "./types";
import { findCorrection } from "./rules.repository";

export function insertCorrection(
  incorrectValue: string,
  correctValue: string,
  partType: TaxonomyPartType
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
