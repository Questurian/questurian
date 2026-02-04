import type { CreateMapsRequest, Location, LocationResponse } from "../../models/location";
import type { PatchMapsDto } from "../../validation/schemas/maps.schemas";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { EnvConfig } from "@server/shared/config/env.config";
import {
  createFromMaps,
  generateGoogleMapsUrl,
  geocode,
} from "../geocoding/location-geocoding.helper";
import {
  getLocationById,
  getLocationByIdForUpdate,
  saveLocation,
  updateLocationById,
} from "../../repositories/core";
import { getInstagramEmbedsByLocationId } from "../../repositories/content";
import { getUploadsByLocationId } from "../../repositories/content";
import { transformLocationToResponse } from "../../utils/location-utils";
import { validateCategory, validateCategoryWithDefault } from "../../utils/category-utils";
import { TaxonomyService } from "../taxonomy/taxonomy.service";
import { TaxonomyCorrectionService } from "../taxonomy/taxonomy-correction.service";
import {
  extractTripadvisorLocationId,
  filterTripadvisorFeatures,
  normalizeTripadvisorUrl,
  normalizeTripadvisorStringList,
} from "../../utils/tripadvisor-utils";
import type { TripAdvisorPlaceService } from "./tripadvisor-place.service";

import type { PayloadApiClient } from "@server/shared/services/external/payload-api.client";

export class MapsService {
  constructor(
    private readonly config: EnvConfig,
    private readonly taxonomyService: TaxonomyService,
    private readonly taxonomyCorrectionService: TaxonomyCorrectionService,
    private readonly payloadClient: PayloadApiClient,
    private readonly tripAdvisorPlaceService: TripAdvisorPlaceService
  ) {}

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

  async addMapsLocation(payload: CreateMapsRequest): Promise<LocationResponse> {
    if (!payload.name || !payload.address) {
      throw new BadRequestError("Name and address required");
    }

    // Validate category
    const category = validateCategory(payload.category);

    const apiKey = this.config.hasGoogleMapsKey() ? this.config.GOOGLE_MAPS_API_KEY : undefined;
    const entry = await createFromMaps(payload.name, payload.address, apiKey, category, payload.type);
    const tripadvisorFields = this.resolveTripadvisorFields(payload.tripadvisorUrl);
    Object.assign(entry, tripadvisorFields);
    if (payload.email) {
      entry.email = payload.email;
    }
    if (payload.neighborhoodDescription) {
      entry.neighborhoodDescription = payload.neighborhoodDescription;
    }
    const hoursJson = this.normalizeOperationHours(payload.operationHours);
    const tripadvisorMealTypesJson = this.normalizeTripadvisorList(payload.tripadvisorMealTypes);
    const tripadvisorCuisinesJson = this.normalizeTripadvisorList(payload.tripadvisorCuisines);
    const tripadvisorFeaturesJson = this.normalizeTripadvisorList(payload.tripadvisorFeatures, {
      filterFeatures: true,
    });
    if (hoursJson !== undefined) {
      entry.hoursJson = hoursJson;
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

    const savedId = saveLocation(entry);
    if (!savedId || typeof savedId !== 'number') {
      throw new BadRequestError("Failed to save location to database");
    }

    // Update entry with the saved ID
    entry.id = savedId;

    // Auto-fetch TripAdvisor place data if tripadvisorLocationId is available
    if (entry.tripadvisorLocationId) {
      try {
        await this.tripAdvisorPlaceService.fetchAndMergePlaceData(savedId, entry.tripadvisorLocationId);
      } catch (error) {
        // Log but don't fail the request - TripAdvisor data is supplementary
        console.error(`[MapsService] TripAdvisor auto-fetch failed for location ${savedId}:`, error);
      }
    }

    // Re-fetch the location to get any updates from TripAdvisor merge
    const updatedEntry = getLocationByIdForUpdate(savedId);
    const finalEntry = updatedEntry || entry;

    // Transform to response format
    const locationWithNested = {
      ...finalEntry,
      instagram_embeds: [],
      uploads: [],
    };

    return transformLocationToResponse(locationWithNested);
  }


  async updateMapsLocationById(id: number, updates: PatchMapsDto): Promise<LocationResponse> {
    console.log(`📝 [UPDATE] Location ${id} received updates:`, updates);

    const currentLocation = getLocationByIdForUpdate(id);
    if (!currentLocation) {
      throw new NotFoundError("Location", id);
    }

    // Validate category if provided
    const category = updates.category ? validateCategory(updates.category) : undefined;

    const nextName = updates.name ?? currentLocation.name;
    const nextAddress = updates.address ?? currentLocation.address;
    const shouldUpdateUrl = updates.name !== undefined || updates.address !== undefined;

    // If updating locationKey, apply corrections and ensure taxonomy entry exists
    if (updates.locationKey !== undefined && updates.locationKey) {
      // Apply corrections BEFORE ensuring taxonomy
      updates.locationKey = this.taxonomyCorrectionService.applyCorrections(updates.locationKey);
      this.taxonomyService.ensureTaxonomyEntry(updates.locationKey);
    }

    // Perform partial update - only update provided fields
    const hoursJson = this.normalizeOperationHours(updates.operationHours);
    const tripadvisorMealTypesJson = this.normalizeTripadvisorList(updates.tripadvisorMealTypes);
    const tripadvisorCuisinesJson = this.normalizeTripadvisorList(updates.tripadvisorCuisines);
    const tripadvisorFeaturesJson = this.normalizeTripadvisorList(updates.tripadvisorFeatures, {
      filterFeatures: true,
    });
    const updateData = {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.address !== undefined && { address: updates.address }),
      ...(updates.title !== undefined && { title: updates.title }),
      ...(category !== undefined && { category }),
      ...(updates.type !== undefined && { type: updates.type }),
      ...(updates.locationKey !== undefined && { locationKey: updates.locationKey }),
      ...(updates.district !== undefined && { district: updates.district }),
      ...(updates.contactAddress !== undefined && { contactAddress: updates.contactAddress }),
      ...(updates.countryCode !== undefined && { countryCode: updates.countryCode }),
      ...(updates.ianaTimeId !== undefined && { ianaTimeId: updates.ianaTimeId }),
      ...(updates.phoneNumber !== undefined && { phoneNumber: updates.phoneNumber }),
      ...(updates.website !== undefined && { website: updates.website }),
      ...(updates.email !== undefined && { email: updates.email }),
      ...(updates.neighborhoodDescription !== undefined && { neighborhoodDescription: updates.neighborhoodDescription }),
      ...(hoursJson !== undefined && { hoursJson }),
      ...(tripadvisorMealTypesJson !== undefined && { tripadvisorMealTypesJson }),
      ...(tripadvisorCuisinesJson !== undefined && { tripadvisorCuisinesJson }),
      ...(tripadvisorFeaturesJson !== undefined && { tripadvisorFeaturesJson }),
      ...(updates.placeId !== undefined && { placeId: updates.placeId }),
      ...(shouldUpdateUrl && { url: generateGoogleMapsUrl(nextName, nextAddress) }),
      ...(updates.tripadvisorUrl !== undefined && this.resolveTripadvisorFields(updates.tripadvisorUrl)),
    };

    const success = updateLocationById(id, updateData);

    if (!success) {
      throw new BadRequestError("Failed to update location");
    }

    const updatedLocation = getLocationByIdForUpdate(id);
    if (!updatedLocation) {
      throw new NotFoundError("Location", id);
    }

    console.log(`✅ [UPDATE] Location ${id} updated successfully. New type:`, updatedLocation.type);

    // Fetch nested data
    const instagramEmbeds = getInstagramEmbedsByLocationId(id);
    const uploads = getUploadsByLocationId(id);

    // Transform to response format
    const locationWithNested = {
      ...updatedLocation,
      instagram_embeds: instagramEmbeds,
      uploads: uploads,
    };

    return transformLocationToResponse(locationWithNested);
  }
}
