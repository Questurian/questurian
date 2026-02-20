export const LOCATION_CATEGORIES = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key_locations",
] as const;

export type LocationCategory = typeof LOCATION_CATEGORIES[number];
