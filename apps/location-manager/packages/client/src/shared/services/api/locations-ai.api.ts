import { apiPost } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  Category,
  AccommodationsFieldSuggestionRequest,
  AccommodationsFieldSuggestionResponse,
  NeighborhoodDescriptionGenerationResponse,
} from "./types";

export const locationsAiApi = {
  async generateNeighborhoodDescription(
    category: Category,
    locationId: number
  ): Promise<NeighborhoodDescriptionGenerationResponse> {
    return apiPost<NeighborhoodDescriptionGenerationResponse>(
      API_ENDPOINTS.GENERATE_NEIGHBORHOOD_DESCRIPTION(category, locationId)
    );
  },

  async suggestAccommodationsField(
    request: AccommodationsFieldSuggestionRequest
  ): Promise<AccommodationsFieldSuggestionResponse> {
    return apiPost<AccommodationsFieldSuggestionResponse>(
      API_ENDPOINTS.ACCOMMODATIONS_FIELD_SUGGESTIONS,
      request
    );
  },
};
