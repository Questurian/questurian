import {
  DEFAULT_TRIPADVISOR_LANGUAGES,
  DEFAULT_TRIPADVISOR_LOCALE,
  DEFAULT_TRIPADVISOR_SORT,
  MAX_TRIPADVISOR_REVIEWS_PER_LANGUAGE,
  PIPELINE_FETCH_SUCCESS_MESSAGES,
} from "../../../../constants/reviews-pipeline.constants";
import type { PipelineDependencies } from "../../../../types/reviews-pipeline.types";
import { TripAdvisorReviewsApiClient } from "../../../integrations/clients/tripadvisor-reviews-api.client";

export interface TripadvisorPipelineSourceDependency {
  isConfigured: () => boolean;
  fetch: PipelineDependencies["fetchTripadvisor"];
}

export function createTripadvisorPipelineSourceDependency(
  tripAdvisorClient: TripAdvisorReviewsApiClient
): TripadvisorPipelineSourceDependency {
  return {
    isConfigured: () => tripAdvisorClient.isConfigured(),
    fetch: async (locationId, location) => {
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
        message: PIPELINE_FETCH_SUCCESS_MESSAGES.tripadvisor,
        languages: result.languages,
        totalReviews: result.totalReviews,
        locationName: result.location?.name ?? null,
        rating: result.location?.rating ?? null,
      };
    },
  };
}
