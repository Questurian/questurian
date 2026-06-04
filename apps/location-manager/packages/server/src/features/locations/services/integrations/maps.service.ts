import type { CreateMapsRequest, Location, LocationCategory, LocationResponse } from "../../models/location";
import type { GooglePrefillResult, TripadvisorPrefillFields } from "./maps/maps.types";
import type { PatchMapsDto } from "../../validation/schemas/maps.schemas";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { EnvConfig } from "@server/shared/config/env.config";
import {
  type AccommodationsApiHints,
  FoursquareApiClient,
} from "./clients/foursquare-api.client";
import { fetchPlaceTypes, mapGoogleTypesToDiningType } from "./google-dining-type";
import { addMapsLocationOperation } from "./maps/add-maps-location.operation";
import { resolveGooglePrefillOperation } from "./maps/prefill.operation";
import { updateMapsLocationByIdOperation } from "./maps/update-maps-location.operation";
import { extractTripadvisorPrefillFields } from "./maps/tripadvisor-prefill";
import {
  findPotentialDuplicateLocations,
  getAttractionTours,
  getLocationByIdForUpdate,
  getInstagramEmbedsByLocationId,
  getUploadsByLocationId,
  updateLocationById,
} from "./maps.dependencies";
import { transformLocationToResponse } from "../../utils/location-utils";
import { validateCategory } from "../../utils/category-utils";
import { TaxonomyService } from "../taxonomy/taxonomy.service";
import { TaxonomyCorrectionService } from "../taxonomy/taxonomy-correction.service";
import {
  extractTripadvisorLocationId,
  filterTripadvisorFeatures,
  normalizeTripadvisorUrl,
  normalizeTripadvisorStringList,
} from "../../utils/tripadvisor-utils";
import type { TripAdvisorPlaceService } from "./tripadvisor-place.service";
import { isValidIdealForTag } from "@shared/types/location-ideal-for";

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
    if (input === undefined) return undefined;
    if (input === null) return null;
    if (typeof input === "string") {
      const trimmed = input.trim();
      if (!trimmed) return null;
      try {
        JSON.parse(trimmed);
      } catch {
        throw new BadRequestError("Operation hours must be valid JSON");
      }
      return trimmed;
    }
    return JSON.stringify(input);
  }

  normalizeSelectedPayloadMediaSetIds(
    input?: string[] | null
  ): string | null | undefined {
    if (input === undefined) return undefined;
    if (input === null) return null;

    const normalized = Array.from(
      new Set(
        input
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      )
    );

    return normalized.length > 0 ? JSON.stringify(normalized) : null;
  }

  normalizeTourIds(input?: number[]): number[] | undefined {
    if (input === undefined) return undefined;
    return Array.from(new Set(input.filter((id) => Number.isInteger(id) && id > 0)));
  }

  normalizeNightlifeDetails(
    input?: Record<string, unknown> | string | null
  ): string | null | undefined {
    if (input === undefined) return undefined;
    if (input === null) return null;

    const stripSpendLevel = (value: Record<string, unknown>): Record<string, unknown> => {
      const details = value.details;
      if (!details || typeof details !== "object" || Array.isArray(details)) {
        return value;
      }

      const detailsRecord = details as Record<string, unknown>;
      const scene = detailsRecord.theScene;
      if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
        return value;
      }

      const sceneRecord = scene as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(sceneRecord, "spendLevel")) {
        return value;
      }

      const nextScene = { ...sceneRecord };
      delete nextScene.spendLevel;

      return {
        ...value,
        details: {
          ...detailsRecord,
          theScene: nextScene,
        },
      };
    };

    if (typeof input === "string") {
      const trimmed = input.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return trimmed;
        }
        return JSON.stringify(stripSpendLevel(parsed as Record<string, unknown>));
      } catch {
        throw new BadRequestError("Nightlife details must be valid JSON");
      }
    }

    return JSON.stringify(stripSpendLevel(input));
  }

  normalizeAccommodationsDetails(
    input?: Record<string, unknown> | string | null
  ): string | null | undefined {
    if (input === undefined) return undefined;
    if (input === null) return null;

    if (typeof input === "string") {
      const trimmed = input.trim();
      if (!trimmed) return null;
      try {
        JSON.parse(trimmed);
      } catch {
        throw new BadRequestError("Accommodations details must be valid JSON");
      }
      return trimmed;
    }

    return JSON.stringify(input);
  }

  normalizeAttractionsDetails(
    input?: Record<string, unknown> | string | null
  ): string | null | undefined {
    if (input === undefined) return undefined;
    if (input === null) return null;

    if (typeof input === "string") {
      const trimmed = input.trim();
      if (!trimmed) return null;
      try {
        JSON.parse(trimmed);
      } catch {
        throw new BadRequestError("Attractions details must be valid JSON");
      }
      return trimmed;
    }

    return JSON.stringify(input);
  }

  normalizeKeyLocationsDetails(
    input?: Record<string, unknown> | string | null
  ): string | null | undefined {
    if (input === undefined) return undefined;
    if (input === null) return null;

    if (typeof input === "string") {
      const trimmed = input.trim();
      if (!trimmed) return null;
      try {
        JSON.parse(trimmed);
      } catch {
        throw new BadRequestError("Key locations details must be valid JSON");
      }
      return trimmed;
    }

    return JSON.stringify(input);
  }

  validateIdealForTagsByCategory(
    category: LocationCategory,
    input?: string[]
  ): void {
    if (category === "attractions") return;
    if (!input) return;

    const uniqueTags = Array.from(new Set(input.map((tag) => tag.trim()).filter(Boolean)));
    const invalidTags = uniqueTags.filter((tag) => !isValidIdealForTag(category, tag));

    if (invalidTags.length > 0) {
      throw new BadRequestError(
        `Invalid Ideal For tags for ${category}: ${invalidTags.join(", ")}`
      );
    }
  }

  resolveTripadvisorFields(tripadvisorUrl?: string | null): { tripadvisorUrl?: string | null; tripadvisorLocationId?: string | null } {
    if (tripadvisorUrl === undefined) {
      return {};
    }
    if (tripadvisorUrl === null) {
      return { tripadvisorUrl: null, tripadvisorLocationId: null };
    }

    const normalizedUrl = normalizeTripadvisorUrl(tripadvisorUrl);
    if (!normalizedUrl) {
      throw new BadRequestError("TripAdvisor URL cannot be empty");
    }

    const locationId = extractTripadvisorLocationId(normalizedUrl);
    if (!locationId) {
      throw new BadRequestError(
        "Invalid TripAdvisor URL. Expected pattern: ...-g<geoId>-d<locationId>-Reviews-..."
      );
    }

    return {
      tripadvisorUrl: normalizedUrl,
      tripadvisorLocationId: locationId,
    };
  }

  normalizeTripadvisorList(
    input?: string[] | string | null,
    options?: { filterFeatures?: boolean }
  ): string | null | undefined {
    if (input === undefined) return undefined;
    if (input === null) return null;

    const normalizeAndStringify = (raw: unknown): string | null => {
      const normalized = normalizeTripadvisorStringList(raw);
      const processed = options?.filterFeatures
        ? filterTripadvisorFeatures(normalized)
        : normalized;
      return processed ? JSON.stringify(processed) : null;
    };

    if (Array.isArray(input)) {
      return normalizeAndStringify(input);
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    // Accept either JSON arrays or comma/newline-separated input.
    try {
      const parsed = JSON.parse(trimmed);
      const fromJson = normalizeAndStringify(parsed);
      if (fromJson !== null) {
        return fromJson;
      }
    } catch {
      // Fall through to delimiter-based parsing.
    }

    const split = trimmed
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return normalizeAndStringify(split);
  }

  normalizeIdealForTags(input?: string[]): string | undefined {
    if (input === undefined) return undefined;
    const normalized = Array.from(
      new Set(
        input
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      )
    );
    return JSON.stringify(normalized);
  }

  shouldPersistIdealFor(category: LocationCategory): boolean {
    return category !== "attractions";
  }

  private normalizeAddressForDuplicateCheck(address: string): string {
    return address
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  private parseStringArrayJson(input?: string | null): string[] {
    if (!input) return [];

    try {
      const parsed = JSON.parse(input);
      if (!Array.isArray(parsed)) return [];

      return Array.from(
        new Set(
          parsed
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        )
      );
    } catch {
      return [];
    }
  }

  private mergeStringArrayJson(
    existingJson?: string | null,
    incomingJson?: string | null,
    maxItems?: number
  ): string | undefined {
    const incoming = this.parseStringArrayJson(incomingJson);
    if (incoming.length === 0) return undefined;

    const existing = this.parseStringArrayJson(existingJson);
    const merged = Array.from(new Set([...existing, ...incoming]));
    const limited = maxItems ? merged.slice(0, maxItems) : merged;

    if (limited.length === 0 || limited.join("|") === existing.join("|")) {
      return undefined;
    }

    return JSON.stringify(limited);
  }

  private scoreDuplicateCandidate(entry: Location, candidate: Location): number {
    let score = 0;
    const normalizedEntryAddress = this.normalizeAddressForDuplicateCheck(entry.address);
    const normalizedCandidateAddress = this.normalizeAddressForDuplicateCheck(candidate.address);

    if (normalizedEntryAddress === normalizedCandidateAddress) {
      score += 40;
    }

    if (
      entry.tripadvisorLocationId &&
      candidate.tripadvisorLocationId &&
      entry.tripadvisorLocationId === candidate.tripadvisorLocationId
    ) {
      score += 100;
    }

    if (entry.tripadvisorUrl && candidate.tripadvisorUrl) {
      const entryUrl = normalizeTripadvisorUrl(entry.tripadvisorUrl);
      const candidateUrl = normalizeTripadvisorUrl(candidate.tripadvisorUrl);

      if (entryUrl === candidateUrl) {
        score += 70;
      }
    }

    return score;
  }

  findDuplicateCandidate(entry: Location): Location | null {
    const candidates = findPotentialDuplicateLocations({
      address: entry.address,
      tripadvisorUrl: entry.tripadvisorUrl,
      tripadvisorLocationId: entry.tripadvisorLocationId,
    });

    const entryCategory = validateCategory(entry.category);
    const sameCategoryCandidates = candidates.filter(
      (candidate) => candidate.category === entryCategory
    );

    if (sameCategoryCandidates.length === 0) {
      return null;
    }

    const scoredCandidates = sameCategoryCandidates
      .map((candidate) => ({
        candidate,
        score: this.scoreDuplicateCandidate(entry, candidate),
      }))
      .sort((a, b) => b.score - a.score);

    const best = scoredCandidates[0];
    if (!best) return null;

    const minimumScore = entry.tripadvisorLocationId
      ? 100
      : entry.tripadvisorUrl
        ? 110
        : 40;

    return best.score >= minimumScore ? best.candidate : null;
  }

  private async mergeDuplicateLocation(
    existingLocation: Location,
    incomingEntry: Location,
    options: { allowNoFieldUpdates?: boolean } = {}
  ): Promise<number> {
    if (!existingLocation.id) {
      throw new BadRequestError("Duplicate location found without a valid ID");
    }

    const existingCategory = validateCategory(existingLocation.category);
    const incomingCategory = validateCategory(incomingEntry.category);

    if (existingCategory !== incomingCategory) {
      throw new BadRequestError(
        `Duplicate location detected. "${existingLocation.name}" already exists as "${existingCategory}".`
      );
    }

    const mergedIdealForJson = this.mergeStringArrayJson(
      existingLocation.idealForJson,
      incomingEntry.idealForJson,
      4
    );

    const updateData: Partial<Location> = {
      ...(mergedIdealForJson !== undefined && { idealForJson: mergedIdealForJson }),
      ...(!existingLocation.type && incomingEntry.type && { type: incomingEntry.type }),
      ...(!existingLocation.locationKey && incomingEntry.locationKey && { locationKey: incomingEntry.locationKey }),
      ...(!existingLocation.district && incomingEntry.district && { district: incomingEntry.district }),
      ...(!existingLocation.contactAddress && incomingEntry.contactAddress && { contactAddress: incomingEntry.contactAddress }),
      ...(!existingLocation.countryCode && incomingEntry.countryCode && { countryCode: incomingEntry.countryCode }),
      ...(!existingLocation.ianaTimeId && incomingEntry.ianaTimeId && { ianaTimeId: incomingEntry.ianaTimeId }),
      ...(!existingLocation.phoneNumber && incomingEntry.phoneNumber && { phoneNumber: incomingEntry.phoneNumber }),
      ...(!existingLocation.website && incomingEntry.website && { website: incomingEntry.website }),
      ...(!existingLocation.menuUrl && incomingEntry.menuUrl && { menuUrl: incomingEntry.menuUrl }),
      ...(!existingLocation.bookingUrl && incomingEntry.bookingUrl && { bookingUrl: incomingEntry.bookingUrl }),
      ...(!existingLocation.email && incomingEntry.email && { email: incomingEntry.email }),
      ...(!existingLocation.neighborhoodDescription && incomingEntry.neighborhoodDescription && { neighborhoodDescription: incomingEntry.neighborhoodDescription }),
      ...(!existingLocation.placeId && incomingEntry.placeId && { placeId: incomingEntry.placeId }),
      ...(!existingLocation.tripadvisorUrl && incomingEntry.tripadvisorUrl && { tripadvisorUrl: incomingEntry.tripadvisorUrl }),
      ...(!existingLocation.tripadvisorLocationId && incomingEntry.tripadvisorLocationId && { tripadvisorLocationId: incomingEntry.tripadvisorLocationId }),
      ...(!existingLocation.attractionsDetailsJson && incomingEntry.attractionsDetailsJson && { attractionsDetailsJson: incomingEntry.attractionsDetailsJson }),
      ...(!existingLocation.keyLocationsDetailsJson && incomingEntry.keyLocationsDetailsJson && { keyLocationsDetailsJson: incomingEntry.keyLocationsDetailsJson }),
      ...(!existingLocation.tripadvisorMealTypesJson && incomingEntry.tripadvisorMealTypesJson && { tripadvisorMealTypesJson: incomingEntry.tripadvisorMealTypesJson }),
      ...(!existingLocation.tripadvisorCuisinesJson && incomingEntry.tripadvisorCuisinesJson && { tripadvisorCuisinesJson: incomingEntry.tripadvisorCuisinesJson }),
      ...(!existingLocation.tripadvisorFeaturesJson && incomingEntry.tripadvisorFeaturesJson && { tripadvisorFeaturesJson: incomingEntry.tripadvisorFeaturesJson }),
    };

    const hasUpdates = Object.keys(updateData).length > 0;
    if (!hasUpdates) {
      if (options.allowNoFieldUpdates) {
        return existingLocation.id;
      }

      throw new BadRequestError(
        `Duplicate location detected. "${existingLocation.name}" already exists with the same category.`
      );
    }

    const merged = updateLocationById(existingLocation.id, updateData);
    if (!merged) {
      throw new BadRequestError("Failed to merge duplicate location fields");
    }

    const tripadvisorIdForFetch =
      incomingEntry.tripadvisorLocationId && !existingLocation.tripadvisorLocationId
        ? incomingEntry.tripadvisorLocationId
        : null;

    if (tripadvisorIdForFetch) {
      try {
        await this.tripAdvisorPlaceService.fetchAndMergePlaceData(existingLocation.id, tripadvisorIdForFetch);
      } catch (error) {
        console.error(
          `[MapsService] TripAdvisor auto-fetch failed during duplicate merge for location ${existingLocation.id}:`,
          error
        );
      }
    }

    return existingLocation.id;
  }

  buildLocationResponseById(id: number, fallbackLocation?: Location): LocationResponse {
    const location = getLocationByIdForUpdate(id) || fallbackLocation;

    if (!location) {
      throw new NotFoundError("Location", id);
    }

    const instagramEmbeds = getInstagramEmbedsByLocationId(id);
    const uploads = getUploadsByLocationId(id);
    const tours = location.category === "attractions" ? getAttractionTours(id) : [];

    return transformLocationToResponse({
      ...location,
      instagram_embeds: instagramEmbeds,
      uploads,
      tours,
    });
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
    if (category !== "dining") {
      return {
        type: null,
        tripadvisorUrl: null,
        tripadvisorUrlProvenance: "tripadvisor",
        tripadvisorPlaceData: null,
        menuUrl: null,
        bookingUrl: null,
      };
    }

    const googleTypesPromise = (async () => {
      try {
        const types = await fetchPlaceTypes(placeId, this.config.GOOGLE_MAPS_API_KEY);
        return mapGoogleTypesToDiningType(types);
      } catch (error) {
        console.warn("[MapsService] Google types lookup failed:", error);
        return null;
      }
    })();

    // Per ADR-0008: TA URL is operator-supplied or explicitly absent.
    // SerpAPI search-by-name fallback was removed alongside the Google-website
    // menu/reservation scraper — both rarely yielded usable values and the
    // AI batch covers the same surface more reliably.
    const tripadvisor: {
      url: string | null;
      provenance: "operator" | "tripadvisor";
    } = overrides?.operatorTripadvisorUrl && !overrides.noTripadvisorListing
      ? {
          url: normalizeTripadvisorUrl(overrides.operatorTripadvisorUrl),
          provenance: "operator",
        }
      : { url: null, provenance: "tripadvisor" };

    const type = await googleTypesPromise;

    // When the operator supplied a TA URL we can extract a tripadvisorLocationId
    // for, fetch TA place data inline so the Step 1 payload carries TripAdvisor-
    // derived fields (cuisines, meal types, features, neighborhood, ...).
    let tripadvisorPlaceData: TripadvisorPrefillFields | null = null;
    if (tripadvisor.url) {
      const tripadvisorLocationId = extractTripadvisorLocationId(tripadvisor.url);
      if (tripadvisorLocationId) {
        const placeResult = await this.tripAdvisorPlaceService.fetchPlaceDataForPrefill(
          tripadvisorLocationId
        );
        if (placeResult) {
          tripadvisorPlaceData = extractTripadvisorPrefillFields(placeResult);
        }
      }
    }

    return {
      type,
      tripadvisorUrl: tripadvisor.url,
      tripadvisorUrlProvenance: tripadvisor.provenance,
      tripadvisorPlaceData,
      menuUrl: null,
      bookingUrl: null,
    };
  }

  async resolveAccommodationsHints(
    category: LocationCategory | undefined,
    name: string,
    address: string,
    lat?: number | null,
    lng?: number | null
  ): Promise<AccommodationsApiHints | null> {
    if (category !== "accommodations") return null;

    try {
      return await this.foursquareClient.getAccommodationsHints({
        name,
        address,
        lat,
        lng,
      });
    } catch (error) {
      console.warn("[MapsService] Foursquare accommodations enrichment failed:", error);
      return null;
    }
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
