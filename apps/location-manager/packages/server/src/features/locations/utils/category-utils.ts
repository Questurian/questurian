import type { LocationCategory } from "@shared/types/location-category";

const VALID_CATEGORIES: readonly LocationCategory[] = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key_locations",
] as const;

function isValidCategory(category: unknown): category is LocationCategory {
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
