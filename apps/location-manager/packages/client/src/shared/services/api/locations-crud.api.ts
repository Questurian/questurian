import { apiGet, apiPost, apiPatch, apiDelete, unwrapEntry } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  LocationsResponse,
  LocationsBasicResponse,
  LocationEntryResponse,
  LocationResponse,
  CreateMapsRequest,
  UpdateMapsRequest,
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
    return apiGet<LocationsResponse>(API_ENDPOINTS.LOCATIONS, params as Record<string, string>);
  },

  async getLocationsBasic(params?: {
    category?: Category;
    locationKey?: string;
  }): Promise<LocationsBasicResponse> {
    return apiGet<LocationsBasicResponse>(API_ENDPOINTS.LOCATIONS_BASIC, params as Record<string, string>);
  },

  async createLocation(data: CreateMapsRequest): Promise<LocationResponse> {
    const response = await apiPost<LocationEntryResponse>(API_ENDPOINTS.CREATE_LOCATION, data);
    return unwrapEntry(response);
  },

  async updateLocation(
    id: number,
    data: UpdateMapsRequest
  ): Promise<LocationResponse> {
    return apiPatch<LocationResponse>(API_ENDPOINTS.UPDATE_LOCATION(id), data);
  },

  async addInstagramEmbed(
    locationId: number,
    data: AddInstagramRequest
  ): Promise<InstagramEmbedResponse["entry"]> {
    const response = await apiPost<InstagramEmbedResponse>(
      API_ENDPOINTS.ADD_INSTAGRAM(locationId),
      data
    );
    return unwrapEntry(response);
  },

  async deleteInstagramEmbed(embedId: number): Promise<void> {
    await apiDelete(API_ENDPOINTS.DELETE_INSTAGRAM_EMBED(embedId));
  },

  async getLocationById(id: number): Promise<LocationResponse> {
    return apiGet<LocationResponse>(API_ENDPOINTS.GET_LOCATION_BY_ID(id));
  },

  async deleteLocation(id: number): Promise<SuccessResponse> {
    return apiDelete<SuccessResponse>(API_ENDPOINTS.DELETE_LOCATION(id));
  },

  async refetchPlaceId(id: number): Promise<{ placeId: string | null; message: string }> {
    return apiPost<{ placeId: string | null; message: string }>(
      API_ENDPOINTS.REFETCH_PLACE_ID(id),
      {}
    );
  },

  async clearDatabase(): Promise<SuccessResponse> {
    return apiGet<SuccessResponse>(API_ENDPOINTS.CLEAR_DB);
  },
};
