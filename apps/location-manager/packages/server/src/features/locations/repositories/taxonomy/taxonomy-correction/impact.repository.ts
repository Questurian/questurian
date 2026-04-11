import { getDb } from "@server/shared/db/client";
import {
  buildTaxonomyLikePattern,
  previewCorrectedLocationKey,
  threeSegmentLocationKeySqlPredicate,
} from "../location-hierarchy/bulk.utils";
import type {
  TaxonomyPartType,
  AffectedPendingTaxonomyEntry,
  AffectedLocationSample,
} from "./types";

function neighborhoodWhereExtra(partType: TaxonomyPartType): string {
  if (partType === "neighborhood") {
    return ` AND ${threeSegmentLocationKeySqlPredicate()}`;
  }
  return "";
}

export function findAffectedPendingTaxonomy(
  incorrectValue: string,
  partType: TaxonomyPartType
): AffectedPendingTaxonomyEntry[] {
  const db = getDb();
  const likePattern = buildTaxonomyLikePattern(incorrectValue, partType);
  const extra = neighborhoodWhereExtra(partType);

  const query = db.query(`
    SELECT locationKey, country, city, neighborhood
    FROM location_taxonomy
    WHERE status = 'pending' AND locationKey LIKE $pattern${extra}
    ORDER BY created_at ASC
    LIMIT 5
  `);

  return query.all({ $pattern: likePattern }) as AffectedPendingTaxonomyEntry[];
}

export function countAffectedLocations(
  incorrectValue: string,
  partType: TaxonomyPartType
): number {
  const db = getDb();
  const likePattern = buildTaxonomyLikePattern(incorrectValue, partType);
  const extra = neighborhoodWhereExtra(partType);

  const query = db.query(`
    SELECT COUNT(*) as count
    FROM entities
    WHERE locationKey LIKE $pattern${extra}
  `);

  const result = query.get({ $pattern: likePattern }) as { count: number } | null;
  return result?.count || 0;
}

export function findAffectedLocationSamples(
  incorrectValue: string,
  correctValue: string,
  partType: TaxonomyPartType
): AffectedLocationSample[] {
  const db = getDb();
  const likePattern = buildTaxonomyLikePattern(incorrectValue, partType);
  const extra = neighborhoodWhereExtra(partType);

  const query = db.query(`
    SELECT id, name, locationKey
    FROM entities
    WHERE locationKey LIKE $pattern${extra}
    LIMIT 5
  `);

  const results = query.all({ $pattern: likePattern }) as Array<{
    id: number;
    name: string;
    locationKey: string;
  }>;

  return results.map((row) => ({
    id: row.id,
    name: row.name,
    currentKey: row.locationKey,
    correctedKey: previewCorrectedLocationKey(
      row.locationKey,
      incorrectValue,
      correctValue,
      partType
    ),
  }));
}
