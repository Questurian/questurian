import type { ReviewSource } from "../types/translate-merge-reviews.types";
import type { ReviewsQueryParams } from "../services/integrations/clients/reviews-api.client";

export const DEFAULT_GOOGLE_PARAMS: Omit<ReviewsQueryParams, "business_id"> = {
  limit: 99,
  translate_reviews: true,
  sort_by: "newest",
  region: "pe",
  language: "en",
};

export const DEFAULT_TRIPADVISOR_LANGUAGES = ["en", "es"] as const;
export const DEFAULT_TRIPADVISOR_SORT: "most_recent" | "detailed_reviews" = "most_recent";
export const DEFAULT_TRIPADVISOR_LOCALE = "en-US";
export const MAX_TRIPADVISOR_REVIEWS_PER_LANGUAGE = 150;

export const JOB_TTL_MS = 1000 * 60 * 60; // 1 hour

export const DEFAULT_PIPELINE_SOURCES: ReviewSource[] = ["tripadvisor"];

export const PIPELINE_PROGRESS = {
  fetchingGoogle: 15,
  fetchingTripadvisor: 45,
  translatingMerging: 80,
} as const;

export const PIPELINE_PROGRESS_MESSAGES = {
  fetchingGoogle: "Fetching Google reviews",
  fetchingTripadvisor: "Fetching TripAdvisor reviews",
  translatingMerging: "Translating and merging reviews",
} as const;

export const PIPELINE_WARNING_MESSAGES = {
  googleNotConfigured: "Google Reviews API not configured - RAPIDAPI_REVIEWS_KEY missing in .env",
  googleMissingPlaceId: "Location does not have a Google Place ID. Please fetch the Place ID first.",
  tripadvisorNotConfigured:
    "TripAdvisor Reviews API not configured - RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY missing in .env",
  tripadvisorMissingUrl: "Location does not have a TripAdvisor URL. Please add a TripAdvisor URL first.",
} as const;

export const PIPELINE_FETCH_ERROR_MESSAGES = {
  google: "Failed to fetch Google reviews",
  tripadvisor: "Failed to fetch TripAdvisor reviews",
} as const;

export const PIPELINE_FETCH_SUCCESS_MESSAGES = {
  google: "Google reviews fetched and saved successfully",
  tripadvisor: "TripAdvisor reviews fetched and saved successfully",
} as const;

export const PIPELINE_EXECUTION_FAILURE_MESSAGE = "Failed to fetch reviews from selected sources.";

export const PIPELINE_CLIENT_WARNING_KEYWORDS = ["place id", "tripadvisor url"] as const;

export const PIPELINE_JOB_PROGRESS = {
  preparing: 5,
  done: 100,
} as const;

export const PIPELINE_JOB_MESSAGES = {
  preparing: "Preparing pipeline",
  failed: "Pipeline failed",
  missingRequiredData: "Missing required data for selected sources",
} as const;

