import type { LocationResponse } from "@client/shared/services/api/types";

export interface CompletenessField {
  key: string;
  label: string;
  present: boolean;
}

export interface CompletenessFieldContext {
  locationDetail: LocationResponse;
  contact: NonNullable<LocationResponse["contact"]>;
  source: NonNullable<LocationResponse["source"]>;
  nightlifeDetails: ReturnType<typeof import("../../../utils/nightlife-details").parseNightlifeDetails>;
  accommodationsDetails: ReturnType<
    typeof import("@client/shared/lib/accommodations-details").parseAccommodationsDetails
  >;
  attractionsDetails: ReturnType<
    typeof import("@client/shared/lib/attractions-details").parseAttractionsDetails
  >;
  keyLocationsDetails: Record<string, unknown> | null;
  hasOperationHours: boolean;
  hasMedia: boolean;
  hasIdealFor: boolean;
  hasCuisines: boolean;
  hasKeyLocationsHours: boolean;
  hasKeyLocationImages: boolean;
}
