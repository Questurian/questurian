export interface AccommodationsApiHints {
  source: "foursquare";
  foursquareId?: string;
  price?: string;
  perfectFor?: string[];
  ac?: "yes" | "no";
  wifi?: "yes" | "no";
  parking?: string[];
  pool?: string[];
}

export interface FoursquareAccommodationsLookupInput {
  name: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
}

interface FoursquareCategory {
  name?: string;
}

export interface FoursquarePlace {
  fsq_id?: string;
  name?: string;
  description?: string;
  price?: number;
  categories?: FoursquareCategory[];
  features?: Record<string, unknown>;
  tastes?: string[];
}
