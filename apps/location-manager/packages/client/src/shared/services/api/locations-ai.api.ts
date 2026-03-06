import { apiPost } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  Category,
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
};
