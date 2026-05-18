import { apiGet, apiPost } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  Category,
  FetchTripAdvisorPlaceResponse,
  TripAdvisorPlaceStatusResponse,
} from "./types";

export const locationsTripAdvisorApi = {
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
