import type { LocationCategory } from "../../models/location";

const CATEGORY_VALUES: readonly LocationCategory[] = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key_locations",
];

export function getTypedTable(category: LocationCategory): string {
  switch (category) {
    case "dining":
      return "dining_locations";
    case "nightlife":
      return "nightlife_locations";
    case "accommodations":
      return "accommodations_locations";
    case "attractions":
      return "attractions_locations";
    case "key_locations":
      return "key_locations_locations";
  }
  throw new Error(`Invalid location category: ${String(category)}`);
}

export function parseCategory(input?: string | null): LocationCategory {
  if (input && CATEGORY_VALUES.includes(input as LocationCategory)) {
    return input as LocationCategory;
  }
  throw new Error(`Invalid location category: ${String(input)}`);
}
