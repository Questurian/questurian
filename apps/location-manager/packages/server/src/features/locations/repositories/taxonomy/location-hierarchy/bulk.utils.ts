import type { TaxonomyPartType } from "./types";

/**
 * Exactly three segments (country|city|neighborhood): two pipe characters.
 * Used so neighborhood corrections do not touch two-part keys (e.g. peru|lima)
 * or replace duplicate slugs in city + neighborhood via naive REPLACE.
 */
export function threeSegmentLocationKeySqlPredicate(): string {
  return "(LENGTH(locationKey) - LENGTH(REPLACE(locationKey, '|', ''))) = 2";
}

/**
 * Preview corrected key; mirrors bulk UPDATE for neighborhood (suffix-only).
 */
export function previewCorrectedLocationKey(
  locationKey: string,
  incorrectValue: string,
  correctValue: string,
  partType: TaxonomyPartType
): string {
  if (partType === "neighborhood") {
    const pipeCount = (locationKey.match(/\|/g) ?? []).length;
    if (pipeCount === 2 && locationKey.endsWith(`|${incorrectValue}`)) {
      return (
        locationKey.slice(0, locationKey.length - incorrectValue.length) +
        correctValue
      );
    }
    return locationKey;
  }
  return locationKey.replace(incorrectValue, correctValue);
}

export function buildTaxonomyLikePattern(
  incorrectValue: string,
  partType: TaxonomyPartType
): string {
  if (partType === "country") {
    return `${incorrectValue}%`;
  }

  if (partType === "city") {
    return `%|${incorrectValue}%`;
  }

  return `%|${incorrectValue}`;
}

export function buildTaxonomyPartColumnUpdate(
  partType: TaxonomyPartType
): string {
  if (partType === "country") {
    return "country = CASE WHEN country = $incorrectValue THEN $correctValue ELSE country END,";
  }

  if (partType === "city") {
    return "city = CASE WHEN city = $incorrectValue THEN $correctValue ELSE city END,";
  }

  return "neighborhood = CASE WHEN neighborhood = $incorrectValue THEN $correctValue ELSE neighborhood END,";
}
