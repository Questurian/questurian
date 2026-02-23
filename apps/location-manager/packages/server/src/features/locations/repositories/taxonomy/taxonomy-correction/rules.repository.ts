import { getDb } from "@server/shared/db/client";
import type { TaxonomyCorrection, TaxonomyPartType } from "./types";

export function getAllCorrections(): TaxonomyCorrection[] {
  const db = getDb();
  const query = db.query(`
    SELECT id, incorrect_value, correct_value, part_type, created_at
    FROM taxonomy_corrections
    ORDER BY created_at DESC
  `);
  return query.all() as TaxonomyCorrection[];
}

export function findCorrection(
  value: string,
  partType: TaxonomyPartType
): TaxonomyCorrection | null {
  const db = getDb();
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

export function getCorrectionById(id: number): TaxonomyCorrection | null {
  const db = getDb();
  const query = db.query(`
    SELECT id, incorrect_value, correct_value, part_type, created_at
    FROM taxonomy_corrections
    WHERE id = $id
  `);
  return query.get({ $id: id }) as TaxonomyCorrection | null;
}
