import type { ReviewSource } from "../controllers/content/translate-merge-reviews.controller";
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

