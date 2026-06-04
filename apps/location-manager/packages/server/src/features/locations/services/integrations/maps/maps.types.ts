import type { Location, LocationCategory, LocationResponse } from "../../../models/location";
import type { PatchMapsDto } from "../../../validation/schemas/maps.schemas";
import type { EnvConfig } from "@server/shared/config/env.config";
import type { TaxonomyService } from "../../taxonomy/taxonomy.service";
import type { TaxonomyCorrectionService } from "../../taxonomy/taxonomy-correction.service";
import type { PayloadApiClient } from "../clients/payload-api.client";
import type {
  AccommodationsApiHints,
  FoursquareApiClient,
} from "../clients/foursquare-api.client";
import type { TripAdvisorPlaceService } from "../tripadvisor-place.service";

export interface TripadvisorPrefillFields {
  email: string | null;
  phoneNumber: string | null;
  website: string | null;
  priceLevel: string | null;
  neighborhood: string | null;
  neighborhoodDescription: string | null;
  operationHours: Record<string, unknown> | null;
  mealTypes: string[] | null;
  cuisines: string[] | null;
  features: string[] | null;
}

export interface GooglePrefillResult {
  googleUrl: string;
  placeId: string;
  lat: number;
  lng: number;
  locationKey: string | null;
  district: string | null;
  ianaTimeId: string | null;
  phoneNumber: string | null;
  website: string | null;
  priceLevel: string | null;
  operationHours: Record<string, unknown> | null;
  accommodationsHints: AccommodationsApiHints | null;
  type: string | null;
  tripadvisorUrl: string | null;
  tripadvisorPlaceData: TripadvisorPrefillFields | null;
  menuUrl: string | null;
  bookingUrl: string | null;
  provenance: Record<string, string>;
}

export interface MapsServiceOperationContext {
  readonly config: EnvConfig;
  readonly taxonomyService: TaxonomyService;
  readonly taxonomyCorrectionService: TaxonomyCorrectionService;
  readonly payloadClient: PayloadApiClient;
  readonly tripAdvisorPlaceService: TripAdvisorPlaceService;
  readonly foursquareClient: FoursquareApiClient;

  normalizeOperationHours(input?: Record<string, unknown> | string | null): string | null | undefined;
  normalizeSelectedPayloadMediaSetIds(input?: string[] | null): string | null | undefined;
  normalizeTourIds(input?: number[]): number[] | undefined;
  normalizeNightlifeDetails(input?: Record<string, unknown> | string | null): string | null | undefined;
  normalizeAccommodationsDetails(input?: Record<string, unknown> | string | null): string | null | undefined;
  normalizeAttractionsDetails(input?: Record<string, unknown> | string | null): string | null | undefined;
  normalizeKeyLocationsDetails(input?: Record<string, unknown> | string | null): string | null | undefined;
  validateIdealForTagsByCategory(category: LocationCategory, input?: string[]): void;
  resolveTripadvisorFields(tripadvisorUrl?: string | null): { tripadvisorUrl?: string | null; tripadvisorLocationId?: string | null };
  normalizeTripadvisorList(input?: string[] | string | null, options?: { filterFeatures?: boolean }): string | null | undefined;
  normalizeIdealForTags(input?: string[]): string | undefined;
  shouldPersistIdealFor(category: LocationCategory): boolean;
  findDuplicateCandidate(entry: Location): Location | null;
  mergeDuplicateLocation(existingLocation: Location, incomingEntry: Location, options?: { allowNoFieldUpdates?: boolean }): Promise<number>;
  buildLocationResponseById(id: number, fallbackLocation?: Location): LocationResponse;
  resolveDiningEnrichment(
    category: LocationCategory | undefined,
    placeId: string,
    overrides?: {
      operatorTripadvisorUrl?: string;
      noTripadvisorListing?: boolean;
    }
  ): Promise<{
    type: string | null;
    tripadvisorUrl: string | null;
    tripadvisorUrlProvenance: "operator" | "tripadvisor";
    tripadvisorPlaceData: TripadvisorPrefillFields | null;
    menuUrl: string | null;
    bookingUrl: string | null;
  }>;
  resolveAccommodationsHints(
    category: LocationCategory | undefined,
    name: string,
    address: string,
    lat?: number | null,
    lng?: number | null
  ): Promise<AccommodationsApiHints | null>;
}

export interface UpdateMapsLocationOptions {
  id: number;
  updates: PatchMapsDto;
  expectedCategory?: LocationCategory;
}
