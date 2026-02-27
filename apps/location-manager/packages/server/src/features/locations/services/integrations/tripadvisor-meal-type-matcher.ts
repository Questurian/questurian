import type { LocationCategory } from "@shared/types/location-category";
import {
  canonicalizeOption,
  DINING_CUISINE_OPTIONS,
  DINING_ESTABLISHMENT_TYPES,
} from "@shared/types/dining-taxonomy";
import { DINING_IDEAL_FOR_TAGS } from "@shared/types/location-ideal-for";

export interface TripAdvisorMealTypeMatchInput {
  category: LocationCategory;
  mealTypes: string[] | null;
  currentType?: string | null;
  currentCuisines?: string[] | null;
  currentIdealFor?: string[] | null;
}

export interface TripAdvisorMealTypeMatchResult {
  nextType?: string;
  nextCuisines?: string[];
  nextIdealFor?: string[];
}

function uniqueMealTypes(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const canonical = canonicalizeOption(trimmed);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    unique.push(trimmed);
  }

  return unique;
}

function appendUniqueCaseInsensitive(
  existing: string[],
  additions: string[],
  options?: { max?: number }
): { nextValues: string[]; changed: boolean } {
  const nextValues = [...existing];
  const seen = new Set(existing.map((value) => canonicalizeOption(value)));
  let changed = false;

  for (const value of additions) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const canonical = canonicalizeOption(trimmed);
    if (seen.has(canonical)) continue;
    if (options?.max !== undefined && nextValues.length >= options.max) {
      break;
    }
    nextValues.push(trimmed);
    seen.add(canonical);
    changed = true;
  }

  return { nextValues, changed };
}

export function matchTripAdvisorMealTypesToDiningFields(
  input: TripAdvisorMealTypeMatchInput
): TripAdvisorMealTypeMatchResult {
  if (input.category !== "dining" || !input.mealTypes || input.mealTypes.length === 0) {
    return {};
  }

  const normalizedMealTypes = uniqueMealTypes(input.mealTypes);
  if (normalizedMealTypes.length === 0) {
    return {};
  }

  const typeByCanonicalLabel = new Map(
    DINING_ESTABLISHMENT_TYPES.map((option) => [
      canonicalizeOption(option.label),
      option.value,
    ])
  );
  const cuisineByCanonical = new Map(
    DINING_CUISINE_OPTIONS.map((option) => [canonicalizeOption(option), option])
  );
  const idealForByCanonical = new Map(
    DINING_IDEAL_FOR_TAGS.map((tag) => [canonicalizeOption(tag), tag])
  );

  const matchedType = normalizedMealTypes
    .map((mealType) => typeByCanonicalLabel.get(canonicalizeOption(mealType)))
    .find((value): value is string => typeof value === "string");
  const matchedCuisines = normalizedMealTypes
    .map((mealType) => cuisineByCanonical.get(canonicalizeOption(mealType)))
    .filter((value): value is string => typeof value === "string");
  const matchedIdealFor = normalizedMealTypes
    .map((mealType) => idealForByCanonical.get(canonicalizeOption(mealType)))
    .filter(
      (
        value
      ): value is (typeof DINING_IDEAL_FOR_TAGS)[number] => value !== undefined
    );

  const result: TripAdvisorMealTypeMatchResult = {};

  const hasCurrentType = typeof input.currentType === "string" && input.currentType.trim().length > 0;
  if (!hasCurrentType && matchedType) {
    result.nextType = matchedType;
  }

  if (matchedCuisines.length > 0) {
    const currentCuisines = input.currentCuisines ?? [];
    const { nextValues, changed } = appendUniqueCaseInsensitive(
      currentCuisines,
      matchedCuisines
    );
    if (changed) {
      result.nextCuisines = nextValues;
    }
  }

  if (matchedIdealFor.length > 0) {
    const currentIdealFor = input.currentIdealFor ?? [];
    const { nextValues, changed } = appendUniqueCaseInsensitive(
      currentIdealFor,
      matchedIdealFor,
      { max: 4 }
    );
    if (changed) {
      result.nextIdealFor = nextValues;
    }
  }

  return result;
}
