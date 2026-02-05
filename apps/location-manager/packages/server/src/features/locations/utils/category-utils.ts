import type { LocationCategory } from "@shared/types/location-category";

export const VALID_CATEGORIES: readonly LocationCategory[] = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife"
] as const;

export function isValidCategory(category: unknown): category is LocationCategory {
  return typeof category === "string" &&
         VALID_CATEGORIES.includes(category as LocationCategory);
}

export function validateCategory(category: unknown): LocationCategory {
  if (isValidCategory(category)) {
    return category;
  }
  throw new Error(
    `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`
  );
}

// Default to "attractions" if category is undefined/null
export function validateCategoryWithDefault(category: unknown | undefined): LocationCategory {
  if (category === undefined || category === null) {
    return "attractions";
  }
  return validateCategory(category);
}
