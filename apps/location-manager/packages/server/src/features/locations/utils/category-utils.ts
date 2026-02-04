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

/**
 * Normalize category input into a unique, ordered array.
 * Falls back to a single default category when nothing valid is provided.
 */
export function normalizeCategoryList(
  categories: unknown,
  fallbackCategory?: unknown
): LocationCategory[] {
  const deduped: LocationCategory[] = [];

  if (Array.isArray(categories)) {
    for (const category of categories) {
      if (isValidCategory(category) && !deduped.includes(category)) {
        deduped.push(category);
      }
    }
  } else if (isValidCategory(categories)) {
    deduped.push(categories);
  }

  if (deduped.length > 0) {
    return deduped;
  }

  return [validateCategoryWithDefault(fallbackCategory)];
}

/**
 * Parse categories_json from the database and ensure a safe fallback.
 */
export function parseCategoryListJson(
  categoriesJson?: string | null,
  fallbackCategory?: unknown
): LocationCategory[] {
  if (!categoriesJson) {
    return normalizeCategoryList(undefined, fallbackCategory);
  }

  try {
    const parsed = JSON.parse(categoriesJson);
    return normalizeCategoryList(parsed, fallbackCategory);
  } catch {
    return normalizeCategoryList(undefined, fallbackCategory);
  }
}

/**
 * Serialize categories for persistence in locations.categories_json.
 */
export function toCategoryListJson(
  categories: unknown,
  fallbackCategory?: unknown
): string {
  return JSON.stringify(normalizeCategoryList(categories, fallbackCategory));
}

/**
 * Merge category arrays while preserving the first-seen order.
 */
export function mergeCategoryLists(
  ...categoryLists: Array<readonly LocationCategory[]>
): LocationCategory[] {
  const merged: LocationCategory[] = [];

  for (const list of categoryLists) {
    for (const category of list) {
      if (!merged.includes(category)) {
        merged.push(category);
      }
    }
  }

  return merged.length > 0 ? merged : ["attractions"];
}
