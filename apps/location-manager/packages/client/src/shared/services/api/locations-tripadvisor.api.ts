import { apiGet, apiPost } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  Category,
  FetchTripAdvisorReviewsRequest,
  FetchTripAdvisorReviewsResponse,
  TripAdvisorReviewsStatusResponse,
  FetchTripAdvisorPlaceResponse,
  TripAdvisorPlaceStatusResponse,
} from "./types";

export const locationsTripAdvisorApi = {
  async fetchTripAdvisorReviews(
    category: Category,
    id: number,
    params: FetchTripAdvisorReviewsRequest
  ): Promise<FetchTripAdvisorReviewsResponse["data"]> {
    return apiPost<FetchTripAdvisorReviewsResponse["data"]>(
      API_ENDPOINTS.FETCH_TRIPADVISOR_REVIEWS(category, id),
      params
    );
  },

  async getTripAdvisorReviewsStatus(
    category: Category,
    id: number
  ): Promise<TripAdvisorReviewsStatusResponse["data"]> {
    return apiGet<TripAdvisorReviewsStatusResponse["data"]>(
      API_ENDPOINTS.TRIPADVISOR_REVIEWS_STATUS(category, id)
    );
  },

  async fetchTripAdvisorPlace(
    category: Category,
    id: number
  ): Promise<FetchTripAdvisorPlaceResponse["data"]> {
    return apiPost<FetchTripAdvisorPlaceResponse["data"]>(
      API_ENDPOINTS.FETCH_TRIPADVISOR_PLACE(category, id),
      {}
    );
  },

  async getTripAdvisorPlaceStatus(
    category: Category,
    id: number
  ): Promise<TripAdvisorPlaceStatusResponse["data"]> {
    return apiGet<TripAdvisorPlaceStatusResponse["data"]>(
      API_ENDPOINTS.TRIPADVISOR_PLACE_STATUS(category, id)
    );
  },
};
