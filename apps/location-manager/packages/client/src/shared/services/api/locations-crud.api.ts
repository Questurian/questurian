import { apiGet, apiPost, apiPatch, apiDelete, unwrapEntry } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  LocationsResponse,
  LocationsBasicResponse,
  LocationEntryResponse,
  LocationResponse,
  CreateMapsRequest,
  UpdateMapsRequest,
  GooglePrefillRequest,
  GooglePrefillResponse,
  AddInstagramRequest,
  InstagramEmbedResponse,
  SuccessResponse,
  Category,
} from "./types";

export const locationsCrudApi = {
  async getLocations(params?: {
    category?: Category;
    locationKey?: string;
  }): Promise<LocationsResponse> {
    const queryParams = params as Record<string, string> | undefined;

    if (params?.category) {
      return apiGet<LocationsResponse>(API_ENDPOINTS.LOCATIONS(params.category), queryParams);
    }

    const categories: Category[] = ["dining", "accommodations", "attractions", "nightlife", "key_locations"];
    const results = await Promise.all(
      categories.map((category) =>
        apiGet<LocationsResponse>(API_ENDPOINTS.LOCATIONS(category), queryParams)
      )
    );

    return { locations: results.flatMap((result) => result.locations), cwd: "" };
  },

  async getLocationsBasic(params?: {
    category?: Category;
    locationKey?: string;
  }): Promise<LocationsBasicResponse> {
    const queryParams = params as Record<string, string> | undefined;

    if (params?.category) {
      return apiGet<LocationsBasicResponse>(API_ENDPOINTS.LOCATIONS_BASIC(params.category), queryParams);
    }

    const categories: Category[] = ["dining", "accommodations", "attractions", "nightlife", "key_locations"];
    const results = await Promise.all(
      categories.map((category) =>
        apiGet<LocationsBasicResponse>(API_ENDPOINTS.LOCATIONS_BASIC(category), queryParams)
      )
    );

    return { locations: results.flatMap((result) => result.locations) };
  },

  async createLocation(data: CreateMapsRequest): Promise<LocationResponse> {
    const response = await apiPost<LocationEntryResponse>(API_ENDPOINTS.CREATE_LOCATION(data.category), data);
    return unwrapEntry(response);
  },

  async googlePrefill(category: Category, data: GooglePrefillRequest): Promise<GooglePrefillResponse> {
    return apiPost<GooglePrefillResponse>(API_ENDPOINTS.GOOGLE_PREFILL(category), data);
  },

  async updateLocation(
    category: Category,
    id: number,
    data: UpdateMapsRequest
  ): Promise<LocationResponse> {
    return apiPatch<LocationResponse>(API_ENDPOINTS.UPDATE_LOCATION(category, id), data);
  },

  async addInstagramEmbed(
    category: Category,
    locationId: number,
    data: AddInstagramRequest
  ): Promise<InstagramEmbedResponse["entry"]> {
    const response = await apiPost<InstagramEmbedResponse>(
      API_ENDPOINTS.ADD_INSTAGRAM(category, locationId),
      data
    );
    return unwrapEntry(response);
  },

  async deleteInstagramEmbed(embedId: number): Promise<void> {
    await apiDelete(API_ENDPOINTS.DELETE_INSTAGRAM_EMBED(embedId));
  },

  async getLocationByCategoryAndId(category: Category, id: number): Promise<LocationResponse> {
    return apiGet<LocationResponse>(API_ENDPOINTS.GET_LOCATION_BY_ID(category, id));
  },

  async getLocationById(id: number, category: Category): Promise<LocationResponse> {
    return this.getLocationByCategoryAndId(category, id);
  },

  async deleteLocation(category: Category, id: number): Promise<SuccessResponse> {
    return apiDelete<SuccessResponse>(API_ENDPOINTS.DELETE_LOCATION(category, id));
  },

  async refetchPlaceId(category: Category, id: number): Promise<{ placeId: string | null; message: string }> {
    return apiPost<{ placeId: string | null; message: string }>(
      API_ENDPOINTS.REFETCH_PLACE_ID(category, id),
      {}
    );
  },

  async clearDatabase(): Promise<SuccessResponse> {
    return apiGet<SuccessResponse>(API_ENDPOINTS.CLEAR_DB);
  },
};
