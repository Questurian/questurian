import type { Context } from "hono";
import path from "node:path";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { EnvConfig } from "@server/shared/config/env.config";
import { SerpApiTripAdvisorClient } from "../../services/integrations/clients/serpapi-tripadvisor.client";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse, errorResponse } from "@shared/types/api-response";
import { filterTripadvisorFeatures, normalizeTripadvisorStringList } from "../../utils/tripadvisor-utils";
import {
  saveTripAdvisorPlace,
  getTripAdvisorPlaceByLocationId,
} from "../../repositories/content/tripadvisor-place.repository";

const config = EnvConfig.getInstance();
const serpApiClient = new SerpApiTripAdvisorClient(config);
const container = ServiceContainer.getInstance();
const MERGED_REVIEWS_DIR = path.join(process.cwd(), "data", "merged-reviews");

interface MinimalReview {
  text: string;
  rating: number;
  date: string;
}

interface AiJsonPayload {
  id: number;
  name: string | null;
  district: string | null;
  neighborhoodDescription: string | null;
  description: string | null;
  reviews_summary: string | null;
  meal_types: string[] | null;
  cuisines: string[] | null;
  features: string[] | null;
  reviews: MinimalReview[];
}

async function loadLatestMergedReviews(locationId: number): Promise<MinimalReview[] | null> {
  if (!existsSync(MERGED_REVIEWS_DIR)) {
    return null;
  }

  const files = await readdir(MERGED_REVIEWS_DIR);
  const locationFiles = files
    .filter((f) => f.startsWith(`merged_reviews_${locationId}_`) && f.endsWith(".json"))
    .sort()
    .reverse();

  if (locationFiles.length === 0) {
    return null;
  }

  const filepath = path.join(MERGED_REVIEWS_DIR, locationFiles[0]!);
  const content = await Bun.file(filepath).text();
  const data = JSON.parse(content) as {
    reviews?: Array<{
      review_text?: string | null;
      rating?: number | null;
      review_datetime_utc?: string | null;
    }>;
  };

  if (!Array.isArray(data.reviews)) {
    return [];
  }

  return data.reviews
    .filter((review) => typeof review.review_text === "string" && review.review_text.trim().length > 0)
    .map((review) => ({
      text: review.review_text ?? "",
      rating: review.rating ?? 0,
      date: review.review_datetime_utc ?? "",
    }));
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, "")     // Remove leading/trailing dashes
    .substring(0, 50);            // Limit length
}

/**
 * POST /api/locations/:id/tripadvisor-place/fetch
 * Fetch TripAdvisor place data from SerpAPI for a location
 */
export async function fetchTripAdvisorPlace(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  if (!serpApiClient.isConfigured()) {
    return c.json(
      errorResponse("SerpAPI not configured - SERPAPI_KEY missing in .env"),
      500
    );
  }

  // Get location to find its TripAdvisor location ID
  const location = container.locationQueryService.getLocationById(locationId);

  if (!location) {
    return c.json(errorResponse("Location not found"), 404);
  }

  if (!location.tripadvisorLocationId) {
    return c.json(
      errorResponse("Location does not have a TripAdvisor location ID. Please add a TripAdvisor URL first to extract the location ID."),
      400
    );
  }

  console.log(`[TripAdvisor Place Controller] Location ID: ${locationId}`);
  console.log(`[TripAdvisor Place Controller] TripAdvisor Location ID: ${location.tripadvisorLocationId}`);

  try {
    // Fetch place data from SerpAPI
    const storedData = await serpApiClient.fetchAndSavePlaceData(
      locationId,
      location.tripadvisorLocationId
    );

    // Save to database
    const savedId = saveTripAdvisorPlace({
      location_id: locationId,
      tripadvisor_place_id: location.tripadvisorLocationId,
      place_data: storedData.placeResult,
    });

    if (savedId === false) {
      console.error("Failed to save TripAdvisor place data to database");
    }

    // Merge select TripAdvisor fields into the location record (fill empty only)
    container.tripAdvisorPlaceService.mergePlaceDataIntoLocation(locationId, storedData.placeResult);

    return c.json(
      successResponse({
        message: "TripAdvisor place data fetched and saved successfully",
        locationId,
        tripadvisorPlaceId: location.tripadvisorLocationId,
        fetchedAt: storedData.fetchedAt,
        placeTitle: storedData.placeResult.title ?? null,
        rating: storedData.placeResult.rating ?? null,
        reviewCount: storedData.placeResult.reviews ?? null,
      })
    );
  } catch (error) {
    console.error("Error fetching TripAdvisor place data:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch TripAdvisor place data";
    return c.json(errorResponse(message), 500);
  }
}

/**
 * GET /api/locations/:id/tripadvisor-place/download
 * Download TripAdvisor place data for a location
 */
export async function downloadTripAdvisorPlace(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  // Get location for the name
  const location = container.locationQueryService.getLocationById(locationId);
  const locationName = location?.source?.name || `location-${locationId}`;
  const sanitizedName = sanitizeFilename(locationName);

  // Try to get from database first
  const dbData = getTripAdvisorPlaceByLocationId(locationId);

  if (dbData) {
    const filename = `${sanitizedName}-tripadvisor-place.json`;

    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);

    return c.body(JSON.stringify(dbData.place_data, null, 2));
  }

  // Fallback to file system
  const storedData = await serpApiClient.getPlaceData(locationId);

  if (!storedData) {
    return c.json(
      errorResponse("No TripAdvisor place data found. Please fetch place data first."),
      404
    );
  }

  const filename = `${sanitizedName}-tripadvisor-place.json`;

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);

  return c.body(JSON.stringify(storedData.placeResult, null, 2));
}

/**
 * GET /api/locations/:id/export
 * Download complete location data with TripAdvisor place data (no reviews)
 */
export async function downloadLocationExport(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  // Get full location data
  const location = container.locationQueryService.getLocationById(locationId);

  if (!location) {
    return c.json(errorResponse("Location not found"), 404);
  }

  const locationName = location.source?.name || `location-${locationId}`;
  const sanitizedName = sanitizeFilename(locationName);

  // Get TripAdvisor place data if available
  const tripAdvisorData = getTripAdvisorPlaceByLocationId(locationId);

  // Build the export object (excluding review-related data)
  const exportData = {
    id: location.id,
    name: location.source?.name,
    title: location.title,
    address: location.source?.address,
    category: location.category,
    type: location.type,
    locationKey: location.locationKey,
    district: location.district,
    slug: location.slug,
    coordinates: location.coordinates,
    contact: location.contact,
    placeId: location.placeId,
    tripadvisorUrl: location.tripadvisorUrl,
    tripadvisorLocationId: location.tripadvisorLocationId,
    neighborhoodDescription: location.neighborhoodDescription,
    idealFor: location.idealFor,
    operationHours: location.operationHours,
    tripadvisorMealTypes: location.tripadvisorMealTypes,
    tripadvisorCuisines: location.tripadvisorCuisines,
    tripadvisorFeatures: location.tripadvisorFeatures,
    created_at: location.created_at,
    updated_at: location.updated_at,
    // TripAdvisor place data
    tripadvisorPlace: tripAdvisorData?.place_data || null,
  };

  const filename = `${sanitizedName}-location-export.json`;

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);

  return c.body(JSON.stringify(exportData, null, 2));
}

/**
 * GET /api/locations/:id/ai-json/download
 * Download AI-ready JSON (core TripAdvisor fields + filtered reviews)
 */
export async function downloadAiJson(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  const location = container.locationQueryService.getLocationById(locationId);
  if (!location) {
    return c.json(errorResponse("Location not found"), 404);
  }

  // Get TripAdvisor place data (required)
  const dbData = getTripAdvisorPlaceByLocationId(locationId);
  const placeData = dbData?.place_data ?? (await serpApiClient.getPlaceData(locationId))?.placeResult ?? null;

  if (!placeData) {
    return c.json(
      errorResponse("No TripAdvisor place data found. Please fetch place data first."),
      404
    );
  }

  // Get merged reviews (required)
  const reviews = await loadLatestMergedReviews(locationId);
  if (!reviews) {
    return c.json(
      errorResponse("No merged reviews found. Please run translate & merge first."),
      404
    );
  }

  const name = location.source?.name ?? location.title ?? null;
  const descriptionValue = (placeData as { description?: unknown }).description;
  const reviewsSummaryValue = (placeData as { reviews_summary?: unknown }).reviews_summary;
  const description = typeof descriptionValue === "string" ? descriptionValue : null;
  const reviewsSummary = typeof reviewsSummaryValue === "string" ? reviewsSummaryValue : null;
  const mealTypes =
    location.tripadvisorMealTypes ??
    normalizeTripadvisorStringList((placeData as { meal_types?: unknown }).meal_types) ??
    normalizeTripadvisorStringList((placeData as { mealtypes?: unknown }).mealtypes);
  const cuisines =
    location.tripadvisorCuisines ??
    normalizeTripadvisorStringList((placeData as { cuisines?: unknown }).cuisines);
  const features =
    location.tripadvisorFeatures ??
    filterTripadvisorFeatures(
      normalizeTripadvisorStringList((placeData as { features?: unknown }).features) ??
      normalizeTripadvisorStringList((placeData as { dining_options?: unknown }).dining_options)
    );

  const payload: AiJsonPayload = {
    id: location.id,
    name,
    district: location.district ?? null,
    neighborhoodDescription: location.neighborhoodDescription ?? null,
    description,
    reviews_summary: reviewsSummary,
    meal_types: mealTypes,
    cuisines,
    features,
    reviews,
  };

  const sanitizedName = sanitizeFilename(name ?? `location-${locationId}`);
  const filename = `${sanitizedName}-ai-json.json`;

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);

  return c.body(JSON.stringify(payload, null, 2));
}

/**
 * GET /api/locations/:id/tripadvisor-place/status
 * Check if TripAdvisor place data exists for a location
 */
export async function getTripAdvisorPlaceStatus(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  // Check database first
  const dbData = getTripAdvisorPlaceByLocationId(locationId);

  if (dbData) {
    return c.json(
      successResponse({
        hasPlaceData: true,
        source: "database",
        fetchedAt: dbData.created_at,
        tripadvisorPlaceId: dbData.tripadvisor_place_id,
        placeTitle: (dbData.place_data as { title?: string }).title ?? null,
        rating: (dbData.place_data as { rating?: number }).rating ?? null,
        reviewCount: (dbData.place_data as { reviews?: number }).reviews ?? null,
      })
    );
  }

  // Fallback to file system
  const storedData = await serpApiClient.getPlaceData(locationId);

  if (storedData) {
    return c.json(
      successResponse({
        hasPlaceData: true,
        source: "file",
        fetchedAt: storedData.fetchedAt,
        tripadvisorPlaceId: storedData.tripadvisorPlaceId,
        placeTitle: storedData.placeResult.title ?? null,
        rating: storedData.placeResult.rating ?? null,
        reviewCount: storedData.placeResult.reviews ?? null,
      })
    );
  }

  return c.json(
    successResponse({
      hasPlaceData: false,
      source: null,
      fetchedAt: null,
      tripadvisorPlaceId: null,
      placeTitle: null,
      rating: null,
      reviewCount: null,
    })
  );
}
