import type { Context } from "hono";
import { EnvConfig } from "@server/shared/config/env.config";
import { ReviewsApiClient, type ReviewsQueryParams, type StoredReviewsData } from "@server/shared/services/external/reviews-api.client";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse, errorResponse } from "@shared/types/api-response";

const config = EnvConfig.getInstance();
const reviewsClient = new ReviewsApiClient(config);
const container = ServiceContainer.getInstance();

type RawReviewsData = {
  reviews_data?: unknown;
  reviews?: unknown;
  cursor?: string;
  next_cursor?: string;
  rating?: number;
  name?: string;
};

type RawReview = {
  review_text?: string | null;
  rating?: number;
  review_rating?: number;
  review_datetime_utc?: string;
  review_photos?: string[] | null;
};

function getRawResponseData(storedData: StoredReviewsData): RawReviewsData {
  return storedData.response.data as RawReviewsData;
}

function getReviewsArray(storedData: StoredReviewsData): RawReview[] {
  const data = getRawResponseData(storedData);
  if (Array.isArray(data.reviews_data)) {
    return data.reviews_data as RawReview[];
  }
  if (Array.isArray(data.reviews)) {
    return data.reviews as RawReview[];
  }
  return [];
}

function getTotalReviews(storedData: StoredReviewsData): number {
  const data = getRawResponseData(storedData);
  if (Array.isArray(data.reviews)) {
    return data.reviews.length;
  }
  if (typeof data.reviews === "number") {
    return data.reviews;
  }
  return 0;
}

function hasMoreReviews(storedData: StoredReviewsData): boolean {
  const data = getRawResponseData(storedData);
  return Boolean(data.next_cursor ?? data.cursor);
}

export interface FetchReviewsDto {
  limit?: number;
  cursor?: string;
  translate_reviews?: boolean;
  query?: string;
  sort_by?: "most_relevant" | "newest" | "highest_ranking" | "lowest_ranking";
  fields?: string;
  region?: string;
  language?: string;
}

export async function fetchReviews(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  if (!reviewsClient.isConfigured()) {
    return c.json(errorResponse("Reviews API not configured - RAPIDAPI_REVIEWS_KEY missing in .env"), 500);
  }

  // Get location to find its Place ID
  const location = container.locationQueryService.getLocationById(locationId);

  if (!location) {
    return c.json(errorResponse("Location not found"), 404);
  }

  if (!location.placeId) {
    return c.json(errorResponse("Location does not have a Google Place ID. Please fetch the Place ID first."), 400);
  }

  // Get query params from request body
  const body = await c.req.json<FetchReviewsDto>().catch(() => ({} as FetchReviewsDto));

  const params: ReviewsQueryParams = {
    business_id: location.placeId,
    limit: body?.limit ?? 20,
    translate_reviews: body?.translate_reviews ?? true,
    sort_by: body?.sort_by ?? "newest",
    region: body?.region ?? "us",
    language: body?.language ?? "en",
  };

  if (body?.cursor) params.cursor = body.cursor;
  if (body?.query) params.query = body.query;
  if (body?.fields) params.fields = body.fields;

  try {
    const storedData = await reviewsClient.fetchAndSaveReviews(locationId, params);
    const reviewsArray = getReviewsArray(storedData);

    return c.json(successResponse({
      message: "Reviews fetched and saved successfully",
      reviewCount: reviewsArray.length,
      totalReviews: getTotalReviews(storedData),
      hasMore: hasMoreReviews(storedData),
      fetchedAt: storedData.fetchedAt,
    }));
  } catch (error) {
    console.error("Error fetching reviews:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch reviews";
    return c.json(errorResponse(message), 500);
  }
}

export async function downloadReviews(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  const storedData = await reviewsClient.getReviewsData(locationId);

  if (!storedData) {
    return c.json(errorResponse("No reviews data found for this location. Please fetch reviews first."), 404);
  }

  // Set headers for file download
  const filename = `reviews_location_${locationId}_${new Date(storedData.fetchedAt).getTime()}.json`;

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);

  const filteredReviews = getReviewsArray(storedData).map((review) => ({
    review_text: review.review_text ?? null,
    rating: review.rating ?? review.review_rating ?? null,
    review_datetime_utc: review.review_datetime_utc ?? null,
    review_photos: Array.isArray(review.review_photos) ? review.review_photos : null,
  }));

  return c.body(JSON.stringify(filteredReviews, null, 2));
}

export async function getReviewsStatus(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  const storedData = await reviewsClient.getReviewsData(locationId);

  if (!storedData) {
    return c.json(successResponse({
      hasReviews: false,
      fetchedAt: null,
      reviewCount: 0,
    }));
  }

  const reviewsArray = getReviewsArray(storedData);

  return c.json(successResponse({
    hasReviews: true,
    fetchedAt: storedData.fetchedAt,
    reviewCount: reviewsArray.length,
    totalReviews: getTotalReviews(storedData),
    rating: getRawResponseData(storedData).rating,
    businessName: getRawResponseData(storedData).name,
  }));
}
