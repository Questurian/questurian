import type { Location } from "../../models/location";
import type { TripAdvisorPlaceResult } from "./clients/serpapi-tripadvisor.client";
import { SerpApiTripAdvisorClient } from "./clients/serpapi-tripadvisor.client";
import { EnvConfig } from "@server/shared/config/env.config";
import { getLocationByIdForUpdate, updateLocationById } from "../../repositories/core";
import { saveTripAdvisorPlace } from "../../repositories/content/tripadvisor-place.repository";
import {
  filterTripadvisorFeatures,
  normalizeTripadvisorStringList,
  parseTripadvisorStringListJson,
} from "../../utils/tripadvisor-utils";
import { matchTripAdvisorMealTypesToDiningFields } from "./tripadvisor-meal-type-matcher";

export class TripAdvisorPlaceService {
  private readonly serpApiClient: SerpApiTripAdvisorClient;

  constructor(config: EnvConfig) {
    this.serpApiClient = new SerpApiTripAdvisorClient(config);
  }

  private hasStoredTripadvisorList(value?: string | null): boolean {
    const parsed = parseTripadvisorStringListJson(value ?? null);
    return Array.isArray(parsed) && parsed.length > 0;
  }

  private parseStoredStringArray(value?: string | null): string[] {
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    } catch {
      return [];
    }
  }

  isConfigured(): boolean {
    return this.serpApiClient.isConfigured();
  }

  /**
   * Merge TripAdvisor place data into a location record.
   * Only fills empty fields (does not overwrite existing data).
   * Includes district fallback from TripAdvisor neighborhood.
   */
  mergePlaceDataIntoLocation(locationId: number, placeResult: TripAdvisorPlaceResult): void {
    const current = getLocationByIdForUpdate(locationId);
    if (!current) return;

    const updates: Partial<Location> = {};

    // Extract fields from TripAdvisor response
    const email = typeof placeResult.email === "string" ? placeResult.email.trim() : null;
    const neighborhoodDescription =
      typeof placeResult.neighborhood_description === "string"
        ? placeResult.neighborhood_description.trim()
        : null;
    const operationHours =
      typeof placeResult.operation_hours === "object" && placeResult.operation_hours !== null
        ? placeResult.operation_hours
        : null;
    const phone = typeof placeResult.phone === "string" ? placeResult.phone.trim() : null;
    const website = typeof placeResult.website === "string" ? placeResult.website.trim() : null;
    const neighborhood = typeof placeResult.neighborhood === "string" ? placeResult.neighborhood.trim() : null;
    const priceLevel = typeof placeResult.price_level === "string" ? placeResult.price_level.trim() : null;
    const mealTypes =
      normalizeTripadvisorStringList(placeResult.meal_types) ??
      normalizeTripadvisorStringList(placeResult.mealtypes);
    const cuisines = normalizeTripadvisorStringList(placeResult.cuisines);
    const hasIncomingFeatureCandidates =
      Array.isArray(placeResult.features) ||
      Array.isArray(placeResult.dining_options);
    const rawFeatures =
      normalizeTripadvisorStringList(placeResult.features) ??
      normalizeTripadvisorStringList(placeResult.dining_options);
    const features = filterTripadvisorFeatures(rawFeatures);

    // Fill empty fields only
    if (!current.email && email) {
      updates.email = email;
    }
    if (!current.neighborhoodDescription && neighborhoodDescription) {
      updates.neighborhoodDescription = neighborhoodDescription;
    }
    if (!current.hoursJson && operationHours) {
      updates.hoursJson = JSON.stringify(operationHours);
    }
    if (!current.phoneNumber && phone) {
      updates.phoneNumber = phone;
    }
    if (!current.website && website) {
      updates.website = website;
    }
    if (!this.hasStoredTripadvisorList(current.tripadvisorMealTypesJson) && mealTypes) {
      updates.tripadvisorMealTypesJson = JSON.stringify(mealTypes);
    }
    if (!this.hasStoredTripadvisorList(current.tripadvisorCuisinesJson) && cuisines) {
      updates.tripadvisorCuisinesJson = JSON.stringify(cuisines);
    }

    if (mealTypes && current.category) {
      const currentCuisinesForMatch = parseTripadvisorStringListJson(
        updates.tripadvisorCuisinesJson ?? current.tripadvisorCuisinesJson ?? null
      ) ?? [];
      const currentIdealForForMatch = this.parseStoredStringArray(current.idealForJson);
      const mealTypeMatches = matchTripAdvisorMealTypesToDiningFields({
        category: current.category,
        mealTypes,
        currentType: current.type,
        currentCuisines: currentCuisinesForMatch,
        currentIdealFor: currentIdealForForMatch,
      });

      if (mealTypeMatches.nextType) {
        updates.type = mealTypeMatches.nextType;
      }
      if (mealTypeMatches.nextCuisines) {
        updates.tripadvisorCuisinesJson = JSON.stringify(mealTypeMatches.nextCuisines);
      }
      if (mealTypeMatches.nextIdealFor) {
        updates.idealForJson = JSON.stringify(mealTypeMatches.nextIdealFor);
      }
    }

    if (hasIncomingFeatureCandidates) {
      const nextFeaturesJson = features ? JSON.stringify(features) : null;
      if (current.tripadvisorFeaturesJson !== nextFeaturesJson) {
        updates.tripadvisorFeaturesJson = nextFeaturesJson;
      }
    }

    // Price level — always overwrite with the mapped value from TripAdvisor
    if (priceLevel && current.priceLevel !== priceLevel) {
      updates.priceLevel = priceLevel;
    }

    // District fallback: use TripAdvisor neighborhood if district is empty
    if (!current.district && neighborhood) {
      updates.district = neighborhood;
      console.log(`[TripAdvisor] Using neighborhood "${neighborhood}" as district fallback for location ${locationId}`);
    }

    if (Object.keys(updates).length > 0) {
      updateLocationById(locationId, updates);
      console.log(`[TripAdvisor] Merged ${Object.keys(updates).length} fields into location ${locationId}:`, Object.keys(updates));
    }
  }

  /**
   * Fetch TripAdvisor place data and merge it into the location.
   * Returns true if successful, false otherwise.
   */
  async fetchAndMergePlaceData(locationId: number, tripadvisorLocationId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      console.log(`[TripAdvisor] SerpAPI not configured, skipping auto-fetch for location ${locationId}`);
      return false;
    }

    try {
      console.log(`[TripAdvisor] Auto-fetching place data for location ${locationId} (TA ID: ${tripadvisorLocationId})`);

      // Fetch and save place data
      const storedData = await this.serpApiClient.fetchAndSavePlaceData(locationId, tripadvisorLocationId);

      // Save to database
      const savedId = saveTripAdvisorPlace({
        location_id: locationId,
        tripadvisor_place_id: tripadvisorLocationId,
        place_data: storedData.placeResult,
      });

      if (savedId === false) {
        console.error(`[TripAdvisor] Failed to save place data to database for location ${locationId}`);
      }

      // Merge into location record
      this.mergePlaceDataIntoLocation(locationId, storedData.placeResult);

      console.log(`[TripAdvisor] Successfully fetched and merged place data for location ${locationId}`);
      return true;
    } catch (error) {
      console.error(`[TripAdvisor] Error fetching place data for location ${locationId}:`, error);
      return false;
    }
  }
}
