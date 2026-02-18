import { apiGet, apiPost } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  Category,
  FetchReviewsRequest,
  FetchReviewsResponse,
  ReviewsStatusResponse,
  FetchReviewsPipelineRequest,
  FetchReviewsPipelineStartResponse,
  FetchReviewsPipelineStatusResponse,
  ReviewsPipelineJobStatus,
} from "./types";

export const locationsReviewsApi = {
  async fetchReviews(category: Category, id: number, params: FetchReviewsRequest): Promise<FetchReviewsResponse["data"]> {
    return apiPost<FetchReviewsResponse["data"]>(
      API_ENDPOINTS.FETCH_REVIEWS(category, id),
      params
    );
  },

  async fetchReviewsPipeline(
    category: Category,
    id: number,
    params: FetchReviewsPipelineRequest
  ): Promise<FetchReviewsPipelineStartResponse["data"]> {
    return apiPost<FetchReviewsPipelineStartResponse["data"]>(
      API_ENDPOINTS.FETCH_REVIEWS_PIPELINE(category, id),
      params
    );
  },

  async getReviewsPipelineStatus(
    category: Category,
    id: number,
    jobId: string
  ): Promise<ReviewsPipelineJobStatus> {
    return apiGet<FetchReviewsPipelineStatusResponse["data"]>(
      API_ENDPOINTS.REVIEWS_PIPELINE_STATUS(category, id, jobId)
    );
  },

  async getReviewsStatus(category: Category, id: number): Promise<ReviewsStatusResponse["data"]> {
    return apiGet<ReviewsStatusResponse["data"]>(
      API_ENDPOINTS.REVIEWS_STATUS(category, id)
    );
  },
};
