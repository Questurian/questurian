import {
  DINING_CUISINE_OPTION_GROUPS,
  DINING_CUISINE_OPTIONS,
} from "@shared/types/dining-taxonomy";

export const CUISINE_OPTION_GROUPS = DINING_CUISINE_OPTION_GROUPS;
export const CUISINE_OPTIONS = DINING_CUISINE_OPTIONS;

export function parseCuisineInput(rawValue: string | null | undefined): string[] {
  if (!rawValue) return [];

  return Array.from(
    new Set(
      rawValue
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
}

export function serializeCuisineInput(values: string[]): string {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(", ");
}
