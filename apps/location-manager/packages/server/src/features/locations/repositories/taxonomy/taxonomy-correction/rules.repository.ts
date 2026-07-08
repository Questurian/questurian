import type { Database } from "bun:sqlite";
import { getDb } from "@server/shared/db/client";
import type { TaxonomyCorrection, TaxonomyPartType } from "./types";

export function getAllCorrections(database?: Database): TaxonomyCorrection[] {
  const db = database ?? getDb();
  const query = db.query(`
    SELECT id, incorrect_value, correct_value, part_type, created_at
    FROM taxonomy_corrections
    ORDER BY created_at DESC
  `);
  return query.all() as TaxonomyCorrection[];
}

export function findCorrection(
  value: string,
  partType: TaxonomyPartType,
  database?: Database
): TaxonomyCorrection | null {
  const db = database ?? getDb();
  const query = db.query(`
    SELECT id, incorrect_value, correct_value, part_type, created_at
    FROM taxonomy_corrections
    WHERE incorrect_value = $value AND part_type = $partType
  `);

  return query.get({
    $value: value,
    $partType: partType,
  }) as TaxonomyCorrection | null;
}

export function getCorrectionById(
  id: number,
  database?: Database
): TaxonomyCorrection | null {
  const db = database ?? getDb();
  const query = db.query(`
    SELECT id, incorrect_value, correct_value, part_type, created_at
    FROM taxonomy_corrections
    WHERE id = $id
  `);
  return query.get({ $id: id }) as TaxonomyCorrection | null;
}

export function insertCorrection(
  incorrectValue: string,
  correctValue: string,
  partType: TaxonomyPartType,
  database?: Database
): TaxonomyCorrection | null {
  const db = database ?? getDb();

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

    return findCorrection(incorrectValue, partType, db);
  } catch (error) {
    console.error("Error inserting correction:", error);
    return null;
  }
}

export function deleteCorrection(id: number, database?: Database): boolean {
  const db = database ?? getDb();

  try {
    const query = db.query(`DELETE FROM taxonomy_corrections WHERE id = $id`);
    const result = query.run({ $id: id });
    return result.changes > 0;
  } catch (error) {
    console.error("Error deleting correction:", error);
    return false;
  }
}
