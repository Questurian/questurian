import { EnvConfig } from "@server/shared/config/env.config";
import { runTranslateAndMergeReviews } from "./translate-merge-reviews.service";
import {
  DEFAULT_GOOGLE_PARAMS,
  DEFAULT_TRIPADVISOR_LANGUAGES,
  DEFAULT_TRIPADVISOR_LOCALE,
  DEFAULT_TRIPADVISOR_SORT,
  MAX_TRIPADVISOR_REVIEWS_PER_LANGUAGE,
} from "../../constants/reviews-pipeline.constants";
import type { PipelineDependencies } from "../../types/reviews-pipeline.types";
import { hasMoreReviews, getReviewsArray, getTotalReviews } from "../../utils/reviews-pipeline.utils";
import { ReviewsApiClient, type ReviewsQueryParams } from "../integrations/clients/reviews-api.client";
import { TripAdvisorReviewsApiClient } from "../integrations/clients/tripadvisor-reviews-api.client";

const config = EnvConfig.getInstance();
const reviewsClient = new ReviewsApiClient(config);
const tripAdvisorClient = new TripAdvisorReviewsApiClient(config);

export function createReviewsPipelineDependencies(): PipelineDependencies {
  return {
    isGoogleConfigured: () => reviewsClient.isConfigured(),
    isTripadvisorConfigured: () => tripAdvisorClient.isConfigured(),
    fetchGoogle: async (locationId, location) => {
      const params: ReviewsQueryParams = {
        business_id: location.placeId,
        ...DEFAULT_GOOGLE_PARAMS,
      };

      const storedData = await reviewsClient.fetchAndSaveReviews(locationId, params);
      const reviewsArray = getReviewsArray(storedData);

      return {
        message: "Google reviews fetched and saved successfully",
        reviewCount: reviewsArray.length,
        totalReviews: getTotalReviews(storedData),
        hasMore: hasMoreReviews(storedData),
        fetchedAt: storedData.fetchedAt,
      };
    },
    fetchTripadvisor: async (locationId, location) => {
      const result = await tripAdvisorClient.fetchAndSaveReviewsForLanguages(
        locationId,
        location.tripadvisorUrl,
        [...DEFAULT_TRIPADVISOR_LANGUAGES],
        {
          sort_by: DEFAULT_TRIPADVISOR_SORT,
          locale: DEFAULT_TRIPADVISOR_LOCALE,
          maxReviews: MAX_TRIPADVISOR_REVIEWS_PER_LANGUAGE,
        }
      );

      return {
        message: "TripAdvisor reviews fetched and saved successfully",
        languages: result.languages,
        totalReviews: result.totalReviews,
        locationName: result.location?.name ?? null,
        rating: result.location?.rating ?? null,
      };
    },
    merge: async (locationId, includeGoogle, includeTripadvisor) => {
      const merged = await runTranslateAndMergeReviews(locationId, {
        includeGoogle,
        includeTripadvisor,
      });

      return {
        filename: merged.filename,
        stats: merged.stats,
        rejectsReport: merged.rejectsReport,
      };
    },
  };
}

