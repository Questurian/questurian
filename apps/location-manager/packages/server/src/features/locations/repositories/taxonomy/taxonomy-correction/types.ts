import type { TaxonomyPartType } from "../location-hierarchy/types";

export type { TaxonomyPartType };

export interface TaxonomyCorrection {
  id?: number;
  incorrect_value: string;
  correct_value: string;
  part_type: TaxonomyPartType;
  created_at?: string;
}

export interface AffectedPendingTaxonomyEntry {
  locationKey: string;
  country: string;
  city: string;
  neighborhood: string;
}

export interface AffectedLocationSample {
  id: number;
  name: string;
  currentKey: string;
  correctedKey: string;
}
