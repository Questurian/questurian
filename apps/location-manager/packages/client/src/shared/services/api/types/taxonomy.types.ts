export interface PendingTaxonomyEntry {
  id: number;
  country: string;
  city: string | null;
  neighborhood: string | null;
  locationKey: string;
  status: 'pending' | 'approved';
  locationCount: number;
  created_at: string;
}

export interface PendingTaxonomyResponse {
  success: true;
  data: {
    entries: PendingTaxonomyEntry[];
  };
}

export interface TaxonomyEntryResponse {
  success: true;
  data: {
    entry: {
      id: number;
      country: string;
      city: string | null;
      neighborhood: string | null;
      locationKey: string;
      status: 'pending' | 'approved';
      created_at: string;
    };
  };
}

export interface TaxonomyCorrectionRequest {
  incorrect_value: string;
  correct_value: string;
  part_type: "country" | "city" | "neighborhood";
}

export interface TaxonomyCorrection extends TaxonomyCorrectionRequest {
  id: number;
  created_at: string;
}

export interface CorrectionPreview {
  pendingTaxonomyCount: number;
  pendingTaxonomySamples: string[];
  locationCount: number;
  locationSamples: Array<{
    id: number;
    name: string;
    currentKey: string;
    correctedKey: string;
  }>;
}

export interface CorrectionResult {
  correction: TaxonomyCorrection;
  updatedPendingCount: number;
  updatedLocationCount: number;
}
