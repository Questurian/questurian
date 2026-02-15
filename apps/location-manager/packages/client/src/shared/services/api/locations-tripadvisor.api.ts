import { apiGet, apiPost } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  FetchTripAdvisorReviewsRequest,
  FetchTripAdvisorReviewsResponse,
  TripAdvisorReviewsStatusResponse,
  FetchTripAdvisorPlaceResponse,
  TripAdvisorPlaceStatusResponse,
} from "./types";

export const locationsTripAdvisorApi = {
  async fetchTripAdvisorReviews(
    id: number,
    params: FetchTripAdvisorReviewsRequest
  ): Promise<FetchTripAdvisorReviewsResponse["data"]> {
    return apiPost<FetchTripAdvisorReviewsResponse["data"]>(
      API_ENDPOINTS.FETCH_TRIPADVISOR_REVIEWS(id),
      params
    );
  },

  async getTripAdvisorReviewsStatus(
    id: number
  ): Promise<TripAdvisorReviewsStatusResponse["data"]> {
    return apiGet<TripAdvisorReviewsStatusResponse["data"]>(
      API_ENDPOINTS.TRIPADVISOR_REVIEWS_STATUS(id)
    );
  },

  async fetchTripAdvisorPlace(
    id: number
  ): Promise<FetchTripAdvisorPlaceResponse["data"]> {
    return apiPost<FetchTripAdvisorPlaceResponse["data"]>(
      API_ENDPOINTS.FETCH_TRIPADVISOR_PLACE(id),
      {}
    );
  },

  async getTripAdvisorPlaceStatus(
    id: number
  ): Promise<TripAdvisorPlaceStatusResponse["data"]> {
    return apiGet<TripAdvisorPlaceStatusResponse["data"]>(
      API_ENDPOINTS.TRIPADVISOR_PLACE_STATUS(id)
    );
  },
};
