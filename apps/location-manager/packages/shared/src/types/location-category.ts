export const LOCATION_CATEGORIES = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife"
] as const;

export type LocationCategory = typeof LOCATION_CATEGORIES[number];
