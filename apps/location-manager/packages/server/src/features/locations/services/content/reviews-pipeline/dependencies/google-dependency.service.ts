import {
  DEFAULT_GOOGLE_PARAMS,
  PIPELINE_FETCH_SUCCESS_MESSAGES,
} from "../../../../constants/reviews-pipeline.constants";
import type { PipelineDependencies } from "../../../../types/reviews-pipeline.types";
import {
  hasMoreReviews,
  getReviewsArray,
  getTotalReviews,
} from "../../../../utils/reviews-pipeline.utils";
import { ReviewsApiClient, type ReviewsQueryParams } from "../../../integrations/clients/reviews-api.client";

export interface GooglePipelineSourceDependency {
  isConfigured: () => boolean;
  fetch: PipelineDependencies["fetchGoogle"];
}

export function createGooglePipelineSourceDependency(
  reviewsClient: ReviewsApiClient
): GooglePipelineSourceDependency {
  return {
    isConfigured: () => reviewsClient.isConfigured(),
    fetch: async (locationId, location) => {
      const params: ReviewsQueryParams = {
        business_id: location.placeId,
        ...DEFAULT_GOOGLE_PARAMS,
      };

      const storedData = await reviewsClient.fetchAndSaveReviews(locationId, params);
      const reviewsArray = getReviewsArray(storedData);

      return {
        message: PIPELINE_FETCH_SUCCESS_MESSAGES.google,
        reviewCount: reviewsArray.length,
        totalReviews: getTotalReviews(storedData),
        hasMore: hasMoreReviews(storedData),
        fetchedAt: storedData.fetchedAt,
      };
    },
  };
}
