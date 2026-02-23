import type { TaxonomyPartType } from "./types";

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
