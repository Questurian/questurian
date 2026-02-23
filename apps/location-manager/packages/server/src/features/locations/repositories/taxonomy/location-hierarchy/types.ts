export type TaxonomyPartType = "country" | "city" | "neighborhood";

/**
 * Database row interface for location_taxonomy table.
 */
export interface LocationHierarchyDbRow {
  id: number;
  country: string;
  city: string | null;
  neighborhood: string | null;
  locationKey: string;
  status?: string;
  created_at?: string;
}
