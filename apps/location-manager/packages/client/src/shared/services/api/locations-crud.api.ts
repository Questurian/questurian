import { apiGet, apiPost, apiPatch, apiDelete, apiPostFormData, unwrapEntry } from "./client";
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

  /**
   * Multipart Create for the Add-flow Photo Import path (ADR-0007). The server
   * creates the Location and writes N fully-formed image-sets in a single
   * handler; rolls back the Location on any image-set failure.
   *
   * `sources[i].variants` MUST contain all 7 variants in any order; the server
   * checks. `sources[i].photographerCredit` MUST be non-empty.
   */
  async createLocationWithPhotos(
    data: CreateMapsRequest,
    sources: Array<{
      sourceName: string;
      sourceFile: File;
      variants: { type: string; file: File }[];
      photographerCredit: string;
    }>
  ): Promise<LocationResponse> {
    if (sources.length === 0) {
      throw new Error("createLocationWithPhotos requires at least one source");
    }
    const form = new FormData();
    form.append("payload", JSON.stringify(data));
    form.append(
      "manifest",
      JSON.stringify({
        sources: sources.map((s, i) => ({
          index: i,
          photographerCredit: s.photographerCredit,
          googlePhotoName: s.sourceName,
        })),
      })
    );
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      form.append(`source_${i}`, s.sourceFile, s.sourceFile.name);
      for (const v of s.variants) {
        form.append(`variant_${i}_${v.type}`, v.file, v.file.name);
      }
    }
    const response = await apiPostFormData<LocationEntryResponse>(
      `${API_ENDPOINTS.CREATE_LOCATION(data.category)}/with-photos`,
      form
    );
    return unwrapEntry(response);
  },

  async googlePrefill(category: Category, data: GooglePrefillRequest): Promise<GooglePrefillResponse> {
    return apiPost<GooglePrefillResponse>(API_ENDPOINTS.GOOGLE_PREFILL(category), data);
  },

  async acceptPendingSuggestion(id: number, field: string): Promise<void> {
    await apiPost(API_ENDPOINTS.PENDING_SUGGESTION_ACCEPT(id), { field });
  },

  async dismissPendingSuggestion(id: number, field: string): Promise<void> {
    await apiPost(API_ENDPOINTS.PENDING_SUGGESTION_DISMISS(id), { field });
  },

  async proposePendingSuggestion(
    id: number,
    field: "bookingUrl",
  ): Promise<{ suggestion: { value: string; confidence: number; reason: string } }> {
    return apiPost(API_ENDPOINTS.PENDING_SUGGESTION_PROPOSE(id), { field });
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
