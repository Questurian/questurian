import type { CreateMapsRequest, Location, LocationCategory, LocationResponse } from "../../models/location";
import type { GooglePrefillResult, TripadvisorPrefillFields } from "./maps/maps.types";
import type { PatchMapsDto } from "../../validation/schemas/maps.schemas";
import { EnvConfig } from "@server/shared/config/env.config";
import { FoursquareApiClient } from "./clients/foursquare-api.client";
import type { AccommodationsApiHints } from "./clients/foursquare.types";
import { addMapsLocationOperation } from "./maps/add-maps-location.operation";
import { resolveGooglePrefillOperation } from "./maps/prefill.operation";
import { updateMapsLocationByIdOperation } from "./maps/update-maps-location.operation";
import {
  findDuplicateCandidate as findDuplicateCandidateImpl,
  mergeDuplicateLocation as mergeDuplicateLocationImpl,
} from "./maps/duplicates";
import {
  resolveAccommodationsHints as resolveAccommodationsHintsImpl,
  resolveDiningEnrichment as resolveDiningEnrichmentImpl,
} from "./maps/enrichment";
import {
  normalizeIdealForTags as normalizeIdealForTagsImpl,
  normalizeJsonField,
  normalizeSelectedPayloadMediaSetIds as normalizeSelectedPayloadMediaSetIdsImpl,
  normalizeTourIds as normalizeTourIdsImpl,
  normalizeTripadvisorList as normalizeTripadvisorListImpl,
  resolveTripadvisorFields as resolveTripadvisorFieldsImpl,
  shouldPersistIdealFor as shouldPersistIdealForImpl,
  stripNightlifeSpendLevel,
  validateIdealForTagsByCategory as validateIdealForTagsByCategoryImpl,
} from "./maps/normalizers";
import { buildLocationResponseById as buildLocationResponseByIdImpl } from "./maps/response";
import { TaxonomyService } from "../taxonomy/taxonomy.service";
import { TaxonomyCorrectionService } from "../taxonomy/taxonomy-correction.service";
import type { TripAdvisorPlaceService } from "./tripadvisor-place.service";

import type { PayloadApiClient } from "./clients/payload-api.client";


export class MapsService {
  readonly foursquareClient: FoursquareApiClient;

  constructor(
    public readonly config: EnvConfig,
    public readonly taxonomyService: TaxonomyService,
    public readonly taxonomyCorrectionService: TaxonomyCorrectionService,
    public readonly payloadClient: PayloadApiClient,
    public readonly tripAdvisorPlaceService: TripAdvisorPlaceService,
    foursquareClient?: FoursquareApiClient
  ) {
    this.foursquareClient = foursquareClient ?? new FoursquareApiClient(config);
  }

  normalizeOperationHours(
    input?: Record<string, unknown> | string | null
  ): string | null | undefined {
    return normalizeJsonField("Operation hours", input);
  }

  normalizeSelectedPayloadMediaSetIds(
    input?: string[] | null
  ): string | null | undefined {
    return normalizeSelectedPayloadMediaSetIdsImpl(input);
  }

  normalizeTourIds(input?: number[]): number[] | undefined {
    return normalizeTourIdsImpl(input);
  }

  normalizeNightlifeDetails(
    input?: Record<string, unknown> | string | null
  ): string | null | undefined {
    return normalizeJsonField("Nightlife details", input, stripNightlifeSpendLevel);
  }

  normalizeAccommodationsDetails(
    input?: Record<string, unknown> | string | null
  ): string | null | undefined {
    return normalizeJsonField("Accommodations details", input);
  }

  normalizeAttractionsDetails(
    input?: Record<string, unknown> | string | null
  ): string | null | undefined {
    return normalizeJsonField("Attractions details", input);
  }

  normalizeKeyLocationsDetails(
    input?: Record<string, unknown> | string | null
  ): string | null | undefined {
    return normalizeJsonField("Key locations details", input);
  }

  validateIdealForTagsByCategory(
    category: LocationCategory,
    input?: string[]
  ): void {
    validateIdealForTagsByCategoryImpl(category, input);
  }

  resolveTripadvisorFields(tripadvisorUrl?: string | null): { tripadvisorUrl?: string | null; tripadvisorLocationId?: string | null } {
    return resolveTripadvisorFieldsImpl(tripadvisorUrl);
  }

  normalizeTripadvisorList(
    input?: string[] | string | null,
    options?: { filterFeatures?: boolean }
  ): string | null | undefined {
    return normalizeTripadvisorListImpl(input, options);
  }

  normalizeIdealForTags(input?: string[]): string | undefined {
    return normalizeIdealForTagsImpl(input);
  }

  shouldPersistIdealFor(category: LocationCategory): boolean {
    return shouldPersistIdealForImpl(category);
  }

  findDuplicateCandidate(entry: Location): Location | null {
    return findDuplicateCandidateImpl(entry);
  }

  async mergeDuplicateLocation(
    existingLocation: Location,
    incomingEntry: Location,
    options: { allowNoFieldUpdates?: boolean } = {}
  ): Promise<number> {
    return mergeDuplicateLocationImpl(this, existingLocation, incomingEntry, options);
  }

  buildLocationResponseById(id: number, fallbackLocation?: Location): LocationResponse {
    return buildLocationResponseByIdImpl(id, fallbackLocation);
  }

  async resolveGooglePrefill(
    name: string,
    address: string,
    category?: LocationCategory,
    diningEnrichmentOverrides?: {
      operatorTripadvisorUrl?: string;
      noTripadvisorListing?: boolean;
    }
  ): Promise<GooglePrefillResult> {
    return resolveGooglePrefillOperation(
      this,
      name,
      address,
      category,
      diningEnrichmentOverrides
    );
  }


  async resolveDiningEnrichment(
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
  }> {
    return resolveDiningEnrichmentImpl(this, category, placeId, overrides);
  }

  async resolveAccommodationsHints(
    category: LocationCategory | undefined,
    name: string,
    address: string,
    lat?: number | null,
    lng?: number | null
  ): Promise<AccommodationsApiHints | null> {
    return resolveAccommodationsHintsImpl(this, category, name, address, lat, lng);
  }

  async addMapsLocation(
    payload: CreateMapsRequest,
    expectedCategory?: LocationCategory
  ): Promise<LocationResponse> {
    return addMapsLocationOperation(this, payload, expectedCategory);
  }


  async updateMapsLocationById(
    id: number,
    updates: PatchMapsDto,
    expectedCategory?: LocationCategory
  ): Promise<LocationResponse> {
    return updateMapsLocationByIdOperation(this, id, updates, expectedCategory);
  }
}
