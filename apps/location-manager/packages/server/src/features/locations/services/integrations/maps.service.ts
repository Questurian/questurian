import type { CreateMapsRequest, Location, LocationCategory, LocationResponse } from "../../models/location";
import type { PatchMapsDto } from "../../validation/schemas/maps.schemas";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { EnvConfig } from "@server/shared/config/env.config";
import {
  createFromMaps,
  generateGoogleMapsUrl,
} from "../geocoding/location-geocoding.helper";
import {
  type AccommodationsApiHints,
  FoursquareApiClient,
} from "./clients/foursquare-api.client";
import { fetchPlaceTypes, mapGoogleTypesToDiningType } from "./google-dining-type";
import {
  findPotentialDuplicateLocations,
  getAttractionTours,
  getLocationByIdForUpdate,
  saveLocationOrThrow,
  setAttractionTours,
  updateLocationById,
} from "../../repositories/core";
import { getInstagramEmbedsByLocationId } from "../../repositories/content";
import { getUploadsByLocationId } from "../../repositories/content";
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
import type { TripAdvisorPlaceResult } from "./clients/serpapi-tripadvisor.client";
import { isValidIdealForTag } from "@shared/types/location-ideal-for";

import type { PayloadApiClient } from "./clients/payload-api.client";

function extractTripadvisorPrefillFields(
  placeResult: TripAdvisorPlaceResult
): TripadvisorPrefillFields {
  const stringOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  const operationHours = (() => {
    const raw = placeResult.operation_hours;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  })();

  return {
    email: stringOrNull(placeResult.email),
    phoneNumber: stringOrNull(placeResult.phone),
    website: stringOrNull(placeResult.website),
    priceLevel: stringOrNull(placeResult.price_level),
    neighborhood: stringOrNull(placeResult.neighborhood),
    neighborhoodDescription: stringOrNull(placeResult.neighborhood_description),
    operationHours,
    mealTypes:
      normalizeTripadvisorStringList(placeResult.meal_types) ??
      normalizeTripadvisorStringList(placeResult.mealtypes),
    cuisines: normalizeTripadvisorStringList(placeResult.cuisines),
    features:
      filterTripadvisorFeatures(
        normalizeTripadvisorStringList(placeResult.features) ??
          normalizeTripadvisorStringList(placeResult.dining_options)
      ) ?? null,
  };
}

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
  reservationUrl: string | null;
  provenance: Record<string, string>;
}

const MAX_ATTRACTION_GALLERY_ITEMS = 20;

export class MapsService {
  private readonly foursquareClient: FoursquareApiClient;

  constructor(
    private readonly config: EnvConfig,
    private readonly taxonomyService: TaxonomyService,
    private readonly taxonomyCorrectionService: TaxonomyCorrectionService,
    private readonly payloadClient: PayloadApiClient,
    private readonly tripAdvisorPlaceService: TripAdvisorPlaceService,
    foursquareClient?: FoursquareApiClient
  ) {
    this.foursquareClient = foursquareClient ?? new FoursquareApiClient(config);
  }

  private normalizeOperationHours(
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

  private normalizeSelectedPayloadMediaSetIds(
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

  private normalizeTourIds(input?: number[]): number[] | undefined {
    if (input === undefined) return undefined;
    return Array.from(new Set(input.filter((id) => Number.isInteger(id) && id > 0)));
  }

  private normalizeNightlifeDetails(
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

  private normalizeAccommodationsDetails(
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

  private normalizeAttractionsDetails(
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

  private normalizeKeyLocationsDetails(
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

  private validateIdealForTagsByCategory(
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

  private resolveTripadvisorFields(tripadvisorUrl?: string | null): { tripadvisorUrl?: string | null; tripadvisorLocationId?: string | null } {
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

  private normalizeTripadvisorList(
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

  private normalizeIdealForTags(input?: string[]): string | undefined {
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

  private shouldPersistIdealFor(category: LocationCategory): boolean {
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

  private findDuplicateCandidate(entry: Location): Location | null {
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
      ...(!existingLocation.reservationUrl && incomingEntry.reservationUrl && { reservationUrl: incomingEntry.reservationUrl }),
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

  private buildLocationResponseById(id: number, fallbackLocation?: Location): LocationResponse {
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
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();

    if (!trimmedName || !trimmedAddress) {
      throw new BadRequestError("Name and address required");
    }

    if (!this.config.hasGoogleMapsKey()) {
      throw new BadRequestError("Google Maps API key not configured");
    }

    const entry = await createFromMaps(
      trimmedName,
      trimmedAddress,
      this.config.GOOGLE_MAPS_API_KEY,
      "nightlife",
      undefined,
      { includeOperationHours: true }
    );

    if (entry.lat == null || entry.lng == null || !entry.placeId) {
      throw new BadRequestError(
        "Could not resolve Place ID and coordinates from Google for this name and address"
      );
    }

    const operationHours = (() => {
      if (!entry.hoursJson) return null;
      try {
        const parsed = JSON.parse(entry.hoursJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return null;
        }
        return parsed as Record<string, unknown>;
      } catch {
        return null;
      }
    })();

    const [accommodationsHints, diningEnrichment] = await Promise.all([
      this.resolveAccommodationsHints(
        category,
        trimmedName,
        trimmedAddress,
        entry.lat,
        entry.lng
      ),
      this.resolveDiningEnrichment(category, entry.placeId, diningEnrichmentOverrides),
    ]);

    const provenance: Record<string, string> = {};
    if (diningEnrichment.type) provenance.type = "google";
    if (diningEnrichment.tripadvisorUrl) {
      provenance.tripadvisorUrl = diningEnrichment.tripadvisorUrlProvenance;
    }
    if (diningEnrichment.menuUrl) provenance.menuUrl = "scraper";
    if (diningEnrichment.reservationUrl) provenance.reservationUrl = "scraper";

    return {
      googleUrl: generateGoogleMapsUrl(trimmedName, trimmedAddress),
      placeId: entry.placeId,
      lat: entry.lat,
      lng: entry.lng,
      locationKey: entry.locationKey ?? null,
      district: entry.district ?? null,
      ianaTimeId: entry.ianaTimeId ?? null,
      phoneNumber: entry.phoneNumber ?? null,
      website: entry.website ?? null,
      priceLevel: entry.priceLevel ?? accommodationsHints?.price ?? null,
      operationHours,
      accommodationsHints,
      type: diningEnrichment.type,
      tripadvisorUrl: diningEnrichment.tripadvisorUrl,
      tripadvisorPlaceData: diningEnrichment.tripadvisorPlaceData,
      menuUrl: diningEnrichment.menuUrl,
      reservationUrl: diningEnrichment.reservationUrl,
      provenance,
    };
  }

  private async resolveDiningEnrichment(
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
    reservationUrl: string | null;
  }> {
    if (category !== "dining") {
      return {
        type: null,
        tripadvisorUrl: null,
        tripadvisorUrlProvenance: "tripadvisor",
        tripadvisorPlaceData: null,
        menuUrl: null,
        reservationUrl: null,
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
      reservationUrl: null,
    };
  }

  private async resolveAccommodationsHints(
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
    if (!payload.name || !payload.address) {
      throw new BadRequestError("Name and address required");
    }

    if (expectedCategory && payload.category !== expectedCategory) {
      throw new BadRequestError(`Category must be "${expectedCategory}" for this endpoint`);
    }

    const category = validateCategory(payload.category);
    const tourIds = this.normalizeTourIds(payload.tourIds);
    if (tourIds !== undefined && category !== "attractions") {
      throw new BadRequestError("Tours can only be linked to attractions");
    }

    const shouldAutoEnrichFromApis = category !== "nightlife";
    const apiKey = shouldAutoEnrichFromApis && this.config.hasGoogleMapsKey()
      ? this.config.GOOGLE_MAPS_API_KEY
      : undefined;
    const entry = await createFromMaps(payload.name, payload.address, apiKey, category, payload.type);
    entry.category = category;
    if (category === "nightlife") {
      // Nightlife creation is manual-first: keep Google URL empty until explicitly set.
      entry.url = "";
    }
    if (payload.title !== undefined) {
      entry.title = payload.title;
    }
    if (payload.url !== undefined) {
      entry.url = payload.url;
    }
    if (payload.lat !== undefined) {
      entry.lat = payload.lat;
    }
    if (payload.lng !== undefined) {
      entry.lng = payload.lng;
    }
    if (payload.locationKey !== undefined) {
      entry.locationKey = payload.locationKey;
    }
    if (payload.district !== undefined) {
      entry.district = payload.district;
    }
    if (payload.contactAddress !== undefined) {
      entry.contactAddress = payload.contactAddress;
    }
    if (payload.countryCode) {
      entry.countryCode = payload.countryCode;
    }
    if (payload.ianaTimeId !== undefined) {
      entry.ianaTimeId = payload.ianaTimeId;
    }
    if (payload.placeId !== undefined) {
      entry.placeId = payload.placeId;
    }
    if (payload.phoneNumber !== undefined) {
      entry.phoneNumber = payload.phoneNumber;
    }
    if (payload.website !== undefined) {
      entry.website = payload.website;
    }
    if (payload.menuUrl !== undefined) {
      entry.menuUrl = payload.menuUrl;
    }
    if (payload.reservationUrl !== undefined) {
      entry.reservationUrl = payload.reservationUrl;
    }
    const tripadvisorFields = this.resolveTripadvisorFields(payload.tripadvisorUrl);
    Object.assign(entry, tripadvisorFields);
    if (payload.email) {
      entry.email = payload.email;
    }
    if (payload.neighborhoodDescription) {
      entry.neighborhoodDescription = payload.neighborhoodDescription;
    }
    if (payload.provenance && Object.keys(payload.provenance).length > 0) {
      entry.provenanceJson = JSON.stringify(payload.provenance);
    }
    if (this.shouldPersistIdealFor(category)) {
      this.validateIdealForTagsByCategory(category, payload.idealFor);
    }
    const hoursJson = this.normalizeOperationHours(payload.operationHours);
    const nightlifeDetailsJson = this.normalizeNightlifeDetails(payload.nightlifeDetails);
    const accommodationsDetailsJson = this.normalizeAccommodationsDetails(payload.accommodationsDetails);
    const attractionsDetailsJson = this.normalizeAttractionsDetails(payload.attractionsDetails);
    const keyLocationsDetailsJson = this.normalizeKeyLocationsDetails(payload.keyLocationsDetails);
    const idealForJson = this.shouldPersistIdealFor(category)
      ? this.normalizeIdealForTags(payload.idealFor)
      : undefined;
    const tripadvisorMealTypesJson = this.normalizeTripadvisorList(payload.tripadvisorMealTypes);
    const tripadvisorCuisinesJson = this.normalizeTripadvisorList(payload.tripadvisorCuisines);
    const tripadvisorFeaturesJson = this.normalizeTripadvisorList(payload.tripadvisorFeatures, {
      filterFeatures: true,
    });
    if (hoursJson !== undefined) {
      entry.hoursJson = hoursJson;
    }
    if (nightlifeDetailsJson !== undefined) {
      entry.nightlifeDetailsJson = nightlifeDetailsJson;
    }
    if (accommodationsDetailsJson !== undefined) {
      entry.accommodationsDetailsJson = accommodationsDetailsJson;
    }
    if (attractionsDetailsJson !== undefined) {
      entry.attractionsDetailsJson = attractionsDetailsJson;
    }
    if (keyLocationsDetailsJson !== undefined) {
      entry.keyLocationsDetailsJson = keyLocationsDetailsJson;
    }
    if (payload.priceLevel !== undefined) {
      entry.priceLevel = payload.priceLevel;
    }
    if (idealForJson !== undefined) {
      entry.idealForJson = idealForJson;
    }
    if (tripadvisorMealTypesJson !== undefined) {
      entry.tripadvisorMealTypesJson = tripadvisorMealTypesJson;
    }
    if (tripadvisorCuisinesJson !== undefined) {
      entry.tripadvisorCuisinesJson = tripadvisorCuisinesJson;
    }
    if (tripadvisorFeaturesJson !== undefined) {
      entry.tripadvisorFeaturesJson = tripadvisorFeaturesJson;
    }

    // Apply corrections and ensure taxonomy entry exists (create as pending if new)
    if (entry.locationKey) {
      // Apply corrections BEFORE ensuring taxonomy
      entry.locationKey = this.taxonomyCorrectionService.applyCorrections(entry.locationKey);
      this.taxonomyService.ensureTaxonomyEntry(entry.locationKey);
    }

    // Duplicate handling only applies within the same category.
    // Cross-category entries (for example dining + nightlife) are allowed as separate docs.
    const duplicate = this.findDuplicateCandidate(entry);
    if (duplicate) {
      const mergedId = await this.mergeDuplicateLocation(duplicate, entry, {
        allowNoFieldUpdates: tourIds !== undefined,
      });
      if (tourIds !== undefined) {
        setAttractionTours(mergedId, tourIds);
      }
      return this.buildLocationResponseById(mergedId, duplicate);
    }

    const savedId = saveLocationOrThrow(entry);
    if (tourIds !== undefined) {
      setAttractionTours(savedId, tourIds);
    }

    // Auto-fetch TripAdvisor place data whenever a TripAdvisor location ID is available.
    if (entry.tripadvisorLocationId) {
      try {
        await this.tripAdvisorPlaceService.fetchAndMergePlaceData(savedId, entry.tripadvisorLocationId);
      } catch (error) {
        // Log but don't fail the request - TripAdvisor data is supplementary
        console.error(`[MapsService] TripAdvisor auto-fetch failed for location ${savedId}:`, error);
      }
    }

    return this.buildLocationResponseById(savedId, {
      ...entry,
      id: savedId,
    });
  }


  async updateMapsLocationById(
    id: number,
    updates: PatchMapsDto,
    expectedCategory?: LocationCategory
  ): Promise<LocationResponse> {
    console.log(`📝 [UPDATE] Location ${id} received updates:`, updates);

    const currentLocation = getLocationByIdForUpdate(id);
    if (!currentLocation) {
      throw new NotFoundError("Location", id);
    }
    if (expectedCategory && currentLocation.category !== expectedCategory) {
      throw new NotFoundError("Location", id);
    }
    const category = validateCategory(currentLocation.category);
    const tourIds = this.normalizeTourIds(updates.tourIds);
    if (tourIds !== undefined && category !== "attractions") {
      throw new BadRequestError("Tours can only be linked to attractions");
    }

    const nextName = updates.name ?? currentLocation.name;
    const nextAddress = updates.address ?? currentLocation.address;
    const shouldUpdateUrl = updates.name !== undefined || updates.address !== undefined;

    const shouldAutoApproveTaxonomy = updates.autoApproveTaxonomy === true;

    // If updating locationKey, apply corrections and ensure taxonomy entry exists
    if (updates.locationKey !== undefined && updates.locationKey) {
      // Apply corrections BEFORE ensuring taxonomy
      updates.locationKey = this.taxonomyCorrectionService.applyCorrections(updates.locationKey);
      this.taxonomyService.ensureTaxonomyEntry(updates.locationKey, {
        autoApprove: shouldAutoApproveTaxonomy,
      });
    }

    // Perform partial update - only update provided fields
    if (this.shouldPersistIdealFor(category)) {
      this.validateIdealForTagsByCategory(category, updates.idealFor);
    }
    const hoursJson = this.normalizeOperationHours(updates.operationHours);
    const nightlifeDetailsJson = this.normalizeNightlifeDetails(updates.nightlifeDetails);
    const accommodationsDetailsJson = this.normalizeAccommodationsDetails(updates.accommodationsDetails);
    const attractionsDetailsJson = this.normalizeAttractionsDetails(updates.attractionsDetails);
    const keyLocationsDetailsJson = this.normalizeKeyLocationsDetails(updates.keyLocationsDetails);
    const idealForJson = this.shouldPersistIdealFor(category)
      ? this.normalizeIdealForTags(updates.idealFor)
      : undefined;
    const tripadvisorMealTypesJson = this.normalizeTripadvisorList(updates.tripadvisorMealTypes);
    const tripadvisorCuisinesJson = this.normalizeTripadvisorList(updates.tripadvisorCuisines);
    const tripadvisorFeaturesJson = this.normalizeTripadvisorList(updates.tripadvisorFeatures, {
      filterFeatures: true,
    });
    const selectedPayloadMediaSetIdsJson = this.normalizeSelectedPayloadMediaSetIds(
      updates.selectedPayloadMediaSetIds
    );

    if (category === "attractions" && selectedPayloadMediaSetIdsJson !== undefined) {
      const uploadsCount = getUploadsByLocationId(id).length;
      const selectedPayloadMediaSetCount = selectedPayloadMediaSetIdsJson
        ? (JSON.parse(selectedPayloadMediaSetIdsJson) as string[]).length
        : 0;

      if (uploadsCount + selectedPayloadMediaSetCount > MAX_ATTRACTION_GALLERY_ITEMS) {
        throw new BadRequestError(
          `Attractions gallery supports up to ${MAX_ATTRACTION_GALLERY_ITEMS} Payload media sets total. ` +
          `This location already has ${uploadsCount} upload${uploadsCount === 1 ? "" : "s"}.`
        );
      }
    }

    const updateData = {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.address !== undefined && { address: updates.address }),
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.lat !== undefined && { lat: updates.lat }),
      ...(updates.lng !== undefined && { lng: updates.lng }),
      ...(updates.type !== undefined && { type: updates.type }),
      ...(updates.locationKey !== undefined && { locationKey: updates.locationKey }),
      ...(updates.district !== undefined && { district: updates.district }),
      ...(updates.contactAddress !== undefined && { contactAddress: updates.contactAddress }),
      ...(updates.countryCode !== undefined && { countryCode: updates.countryCode }),
      ...(updates.ianaTimeId !== undefined && { ianaTimeId: updates.ianaTimeId }),
      ...(updates.phoneNumber !== undefined && { phoneNumber: updates.phoneNumber }),
      ...(updates.website !== undefined && { website: updates.website }),
      ...(updates.menuUrl !== undefined && { menuUrl: updates.menuUrl }),
      ...(updates.reservationUrl !== undefined && { reservationUrl: updates.reservationUrl }),
      ...(updates.email !== undefined && { email: updates.email }),
      ...(updates.neighborhoodDescription !== undefined && { neighborhoodDescription: updates.neighborhoodDescription }),
      ...(selectedPayloadMediaSetIdsJson !== undefined && { selectedPayloadMediaSetIdsJson }),
      ...(idealForJson !== undefined && { idealForJson }),
      ...(nightlifeDetailsJson !== undefined && { nightlifeDetailsJson }),
      ...(accommodationsDetailsJson !== undefined && { accommodationsDetailsJson }),
      ...(attractionsDetailsJson !== undefined && { attractionsDetailsJson }),
      ...(keyLocationsDetailsJson !== undefined && { keyLocationsDetailsJson }),
      ...(hoursJson !== undefined && { hoursJson }),
      ...(tripadvisorMealTypesJson !== undefined && { tripadvisorMealTypesJson }),
      ...(tripadvisorCuisinesJson !== undefined && { tripadvisorCuisinesJson }),
      ...(tripadvisorFeaturesJson !== undefined && { tripadvisorFeaturesJson }),
      ...(updates.priceLevel !== undefined && { priceLevel: updates.priceLevel }),
      ...(updates.placeId !== undefined && { placeId: updates.placeId }),
      ...(shouldUpdateUrl && { url: generateGoogleMapsUrl(nextName, nextAddress) }),
      ...(updates.tripadvisorUrl !== undefined && this.resolveTripadvisorFields(updates.tripadvisorUrl)),
    };

    if (Object.keys(updateData).length > 0) {
      const success = updateLocationById(id, updateData);

      if (!success) {
        throw new BadRequestError("Failed to update location");
      }
    }

    if (tourIds !== undefined) {
      setAttractionTours(id, tourIds);
    }

    const updatedLocation = getLocationByIdForUpdate(id);
    if (!updatedLocation) {
      throw new NotFoundError("Location", id);
    }

    console.log(`✅ [UPDATE] Location ${id} updated successfully. New type:`, updatedLocation.type);

    return this.buildLocationResponseById(id, updatedLocation);
  }
}
