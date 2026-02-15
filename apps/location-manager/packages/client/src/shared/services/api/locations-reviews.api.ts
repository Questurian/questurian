import { apiGet, apiPost } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  FetchReviewsRequest,
  FetchReviewsResponse,
  ReviewsStatusResponse,
  FetchReviewsPipelineRequest,
  FetchReviewsPipelineStartResponse,
  FetchReviewsPipelineStatusResponse,
  ReviewsPipelineJobStatus,
} from "./types";

export const locationsReviewsApi = {
  async fetchReviews(id: number, params: FetchReviewsRequest): Promise<FetchReviewsResponse["data"]> {
    return apiPost<FetchReviewsResponse["data"]>(
      API_ENDPOINTS.FETCH_REVIEWS(id),
      params
    );
  },

  async fetchReviewsPipeline(
    id: number,
    params: FetchReviewsPipelineRequest
  ): Promise<FetchReviewsPipelineStartResponse["data"]> {
    return apiPost<FetchReviewsPipelineStartResponse["data"]>(
      API_ENDPOINTS.FETCH_REVIEWS_PIPELINE(id),
      params
    );
  },

  async getReviewsPipelineStatus(
    id: number,
    jobId: string
  ): Promise<ReviewsPipelineJobStatus> {
    return apiGet<FetchReviewsPipelineStatusResponse["data"]>(
      API_ENDPOINTS.REVIEWS_PIPELINE_STATUS(id, jobId)
    );
  },

  async getReviewsStatus(id: number): Promise<ReviewsStatusResponse["data"]> {
    return apiGet<ReviewsStatusResponse["data"]>(
      API_ENDPOINTS.REVIEWS_STATUS(id)
    );
  },
};
