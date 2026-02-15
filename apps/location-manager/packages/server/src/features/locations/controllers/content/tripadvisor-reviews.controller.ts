import type { Context } from "hono";
import { EnvConfig } from "@server/shared/config/env.config";
import { TripAdvisorReviewsApiClient } from "../../services/integrations/clients/tripadvisor-reviews-api.client";
import type { FetchTripAdvisorReviewsDto, TripAdvisorReview } from "../../services/integrations/types/tripadvisor-reviews.types";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse, errorResponse } from "@shared/types/api-response";

const config = EnvConfig.getInstance();
const tripAdvisorClient = new TripAdvisorReviewsApiClient(config);
const container = ServiceContainer.getInstance();
const MAX_TRIPADVISOR_REVIEWS_PER_LANGUAGE = 150;

/**
 * POST /api/locations/:id/tripadvisor-reviews/fetch
 * Fetch TripAdvisor reviews for a location
 */
export async function fetchTripAdvisorReviews(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  if (!tripAdvisorClient.isConfigured()) {
    return c.json(
      errorResponse("TripAdvisor Reviews API not configured - RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY missing in .env"),
      500
    );
  }

  // Get location to find its TripAdvisor location ID
  const location = container.locationQueryService.getLocationById(locationId);

  if (!location) {
    return c.json(errorResponse("Location not found"), 404);
  }

  if (!location.tripadvisorUrl) {
    return c.json(
      errorResponse("Location does not have a TripAdvisor URL. Please add a TripAdvisor URL first."),
      400
    );
  }

  console.log(`[TripAdvisor Controller] Location ID: ${locationId}`);
  console.log(`[TripAdvisor Controller] TripAdvisor URL: ${location.tripadvisorUrl}`);
  console.log(`[TripAdvisor Controller] TripAdvisor Location ID: ${location.tripadvisorLocationId}`);

  // Get query params from request body
  const body = await c.req.json<FetchTripAdvisorReviewsDto>().catch(() => ({} as FetchTripAdvisorReviewsDto));

  // Validate languages
  const languages = body.languages || ["en"];
  if (!Array.isArray(languages) || languages.length === 0) {
    return c.json(errorResponse("At least one language is required"), 400);
  }

  try {
    const result = await tripAdvisorClient.fetchAndSaveReviewsForLanguages(
      locationId,
      location.tripadvisorUrl,
      languages,
      {
        sort_by: body.sort_by ?? "most_recent",
        locale: body.locale ?? "en-US",
        maxReviews: MAX_TRIPADVISOR_REVIEWS_PER_LANGUAGE,
      }
    );

    return c.json(
      successResponse({
        message: "TripAdvisor reviews fetched and saved successfully",
        languages: result.languages,
        totalReviews: result.totalReviews,
        locationName: result.location?.name ?? null,
        rating: result.location?.rating ?? null,
      })
    );
  } catch (error) {
    console.error("Error fetching TripAdvisor reviews:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch TripAdvisor reviews";
    return c.json(errorResponse(message), 500);
  }
}

/**
 * GET /api/locations/:id/tripadvisor-reviews/download
 * Download TripAdvisor reviews for a location
 * Query param: ?lang=en (optional, downloads all languages if not specified)
 */
export async function downloadTripAdvisorReviews(c: Context) {
  const locationId = parseInt(c.req.param("id"));
  const language = c.req.query("lang");

  const mapReviewToGoogleFormat = (review: TripAdvisorReview) => ({
    review_text: review.text ?? null,
    rating: review.rating ?? null,
    review_datetime_utc: review.published_at_date ?? null,
    review_photos: Array.isArray(review.images) && review.images.length > 0 ? review.images : null,
  });

  if (language) {
    // Download specific language
    const storedData = await tripAdvisorClient.getReviewsData(locationId, language);

    if (!storedData) {
      return c.json(
        errorResponse(`No TripAdvisor reviews data found for language: ${language}. Please fetch reviews first.`),
        404
      );
    }

    const filename = `tripadvisor_reviews_location_${locationId}_${language}_${new Date(storedData.fetchedAt).getTime()}.json`;

    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);

    // Transform reviews to match Google reviews format
    const filteredReviews = storedData.reviews.map(mapReviewToGoogleFormat);

    return c.body(JSON.stringify(filteredReviews, null, 2));
  } else {
    // Download all languages as a combined object
    const status = await tripAdvisorClient.getReviewsStatus(locationId);

    if (!status.hasReviews) {
      return c.json(errorResponse("No TripAdvisor reviews data found. Please fetch reviews first."), 404);
    }

    const allReviews: Record<string, unknown[]> = {};

    for (const langInfo of status.languages) {
      const storedData = await tripAdvisorClient.getReviewsData(locationId, langInfo.language);
      if (storedData) {
        allReviews[langInfo.language] = storedData.reviews.map(mapReviewToGoogleFormat);
      }
    }

    const filename = `tripadvisor_reviews_location_${locationId}_all_${Date.now()}.json`;

    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);

    return c.body(
      JSON.stringify(
        {
          locationId,
          totalReviews: status.totalReviews,
          rating: status.rating,
          locationName: status.locationName,
          languages: Object.keys(allReviews),
          reviews: allReviews,
        },
        null,
        2
      )
    );
  }
}

/**
 * GET /api/locations/:id/tripadvisor-reviews/status
 * Check the status of TripAdvisor reviews for a location
 */
export async function getTripAdvisorReviewsStatus(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  const status = await tripAdvisorClient.getReviewsStatus(locationId);

  return c.json(successResponse(status));
}
