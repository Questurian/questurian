import { EnvConfig } from "@server/shared/config/env.config";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import type { LocationResponse } from "../../models/location";
import {
  TRIPADVISOR_PLACE_DOWNLOAD_SUFFIXES,
  TRIPADVISOR_PLACE_MESSAGES,
} from "../../constants/tripadvisor-place.constants";
import {
  getTripAdvisorPlaceByLocationId,
  saveTripAdvisorPlace,
} from "../../repositories/content/tripadvisor-place.repository";
import type {
  FetchTripAdvisorPlacePayload,
  JsonDownloadPayload,
  TripAdvisorPlaceStatusPayload,
} from "../../types/tripadvisor-place.types";
import { buildLocationExportPayload } from "../../utils/tripadvisor-export.utils";
import { sanitizeFilename } from "../../utils/tripadvisor-filename.utils";
import { SerpApiTripAdvisorClient } from "../integrations/clients/serpapi-tripadvisor.client";
import { TripAdvisorPlaceError } from "./tripadvisor-place.errors";

interface StoredPlaceLookup {
  source: "database" | "file";
  fetchedAt: string | null;
  tripadvisorPlaceId: string | null;
  placeData: Record<string, unknown>;
}

const config = EnvConfig.getInstance();
const serpApiClient = new SerpApiTripAdvisorClient(config);
const container = ServiceContainer.getInstance();

function getLocationOrThrow(locationId: number): LocationResponse {
  const location = container.locationQueryService.getLocationById(locationId);
  if (!location) {
    throw new TripAdvisorPlaceError(TRIPADVISOR_PLACE_MESSAGES.locationNotFound, 404);
  }

  return location;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

async function resolveStoredPlaceData(locationId: number): Promise<StoredPlaceLookup | null> {
  const dbData = getTripAdvisorPlaceByLocationId(locationId);
  if (dbData) {
    return {
      source: "database",
      fetchedAt: dbData.created_at ?? null,
      tripadvisorPlaceId: dbData.tripadvisor_place_id ?? null,
      placeData: dbData.place_data,
    };
  }

  const fileData = await serpApiClient.getPlaceData(locationId);
  if (!fileData) {
    return null;
  }

  return {
    source: "file",
    fetchedAt: fileData.fetchedAt,
    tripadvisorPlaceId: fileData.tripadvisorPlaceId,
    placeData: fileData.placeResult,
  };
}

export async function fetchTripAdvisorPlaceData(
  locationId: number
): Promise<FetchTripAdvisorPlacePayload> {
  if (!serpApiClient.isConfigured()) {
    throw new TripAdvisorPlaceError(TRIPADVISOR_PLACE_MESSAGES.notConfigured, 500);
  }

  const location = getLocationOrThrow(locationId);
  if (!location.tripadvisorLocationId) {
    throw new TripAdvisorPlaceError(TRIPADVISOR_PLACE_MESSAGES.missingLocationId, 400);
  }

  console.log(`[TripAdvisor Place Controller] Location ID: ${locationId}`);
  console.log(
    `[TripAdvisor Place Controller] TripAdvisor Location ID: ${location.tripadvisorLocationId}`
  );

  const storedData = await serpApiClient.fetchAndSavePlaceData(
    locationId,
    location.tripadvisorLocationId
  );

  const savedId = saveTripAdvisorPlace({
    location_id: locationId,
    tripadvisor_place_id: location.tripadvisorLocationId,
    place_data: storedData.placeResult,
  });

  if (savedId === false) {
    console.error("Failed to save TripAdvisor place data to database");
  }

  container.tripAdvisorPlaceService.mergePlaceDataIntoLocation(
    locationId,
    storedData.placeResult
  );

  return {
    message: TRIPADVISOR_PLACE_MESSAGES.fetchSuccess,
    locationId,
    tripadvisorPlaceId: location.tripadvisorLocationId,
    fetchedAt: storedData.fetchedAt,
    placeTitle: storedData.placeResult.title ?? null,
    rating: storedData.placeResult.rating ?? null,
    reviewCount: toNullableNumber(storedData.placeResult.reviews),
  };
}

export async function getTripAdvisorPlaceDownloadPayload(
  locationId: number
): Promise<JsonDownloadPayload> {
  const location = container.locationQueryService.getLocationById(locationId);
  const locationName = location?.source?.name || `location-${locationId}`;
  const sanitizedName = sanitizeFilename(locationName);
  const filename = `${sanitizedName}-${TRIPADVISOR_PLACE_DOWNLOAD_SUFFIXES.place}`;

  const placeData = await resolveStoredPlaceData(locationId);
  if (!placeData) {
    throw new TripAdvisorPlaceError(TRIPADVISOR_PLACE_MESSAGES.noPlaceDataFound, 404);
  }

  return {
    filename,
    content: JSON.stringify(placeData.placeData, null, 2),
  };
}

export function getLocationExportDownloadPayload(locationId: number): JsonDownloadPayload {
  const location = getLocationOrThrow(locationId);
  const locationName = location.source?.name || `location-${locationId}`;
  const sanitizedName = sanitizeFilename(locationName);
  const filename = `${sanitizedName}-${TRIPADVISOR_PLACE_DOWNLOAD_SUFFIXES.export}`;
  const tripAdvisorData = getTripAdvisorPlaceByLocationId(locationId);

  return {
    filename,
    content: JSON.stringify(
      buildLocationExportPayload(location, tripAdvisorData?.place_data ?? null),
      null,
      2
    ),
  };
}

export async function getTripAdvisorPlaceStatusPayload(
  locationId: number
): Promise<TripAdvisorPlaceStatusPayload> {
  const placeData = await resolveStoredPlaceData(locationId);
  if (!placeData) {
    return {
      hasPlaceData: false,
      source: null,
      fetchedAt: null,
      tripadvisorPlaceId: null,
      placeTitle: null,
      rating: null,
      reviewCount: null,
    };
  }

  return {
    hasPlaceData: true,
    source: placeData.source,
    fetchedAt: placeData.fetchedAt,
    tripadvisorPlaceId: placeData.tripadvisorPlaceId,
    placeTitle: toNullableString(placeData.placeData.title),
    rating: toNullableNumber(placeData.placeData.rating),
    reviewCount: toNullableNumber(placeData.placeData.reviews),
  };
}
