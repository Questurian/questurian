/**
 * Location management API
 */

import { apiGet, apiPost, apiPatch, apiPostFormData, apiDelete, unwrapEntry } from "./client";
import { API_ENDPOINTS, API_BASE_URL } from "./config";
import type {
  LocationsResponse,
  LocationsBasicResponse,
  LocationEntryResponse,
  Location,
  LocationResponse,
  CreateMapsRequest,
  UpdateMapsRequest,
  AddInstagramRequest,
  InstagramEmbedResponse,
  UploadResponse,
  SuccessResponse,
  Category,
  FetchReviewsRequest,
  FetchReviewsResponse,
  ReviewsStatusResponse,
  FetchReviewsPipelineRequest,
  FetchReviewsPipelineStartResponse,
  FetchReviewsPipelineStatusResponse,
  ReviewsPipelineJobStatus,
  FetchTripAdvisorReviewsRequest,
  FetchTripAdvisorReviewsResponse,
  TripAdvisorReviewsStatusResponse,
  TranslateMergeReviewsResponse,
  MergedReviewsStatusResponse,
} from "./types";
import type { ImageVariantType } from "@questurian/lm-shared";

// ============================================================================
// LOCATION MANAGEMENT
// ============================================================================

export const locationsApi = {
  /**
   * Get all locations with optional filters
   */
  async getLocations(params?: {
    category?: Category;
    locationKey?: string;
  }): Promise<LocationsResponse> {
    return apiGet<LocationsResponse>(API_ENDPOINTS.LOCATIONS, params as Record<string, string>);
  },

  /**
   * Get basic location info with optional filters
   */
  async getLocationsBasic(params?: {
    category?: Category;
    locationKey?: string;
  }): Promise<LocationsBasicResponse> {
    return apiGet<LocationsBasicResponse>(API_ENDPOINTS.LOCATIONS_BASIC, params as Record<string, string>);
  },

  /**
   * Create a new location
   */
  async createLocation(data: CreateMapsRequest): Promise<Location> {
    const response = await apiPost<LocationEntryResponse>(API_ENDPOINTS.CREATE_LOCATION, data);
    return unwrapEntry(response);
  },

  /**
   * Update an existing location
   */
  async updateLocation(
    id: number,
    data: UpdateMapsRequest
  ): Promise<Location> {
    return apiPatch<Location>(API_ENDPOINTS.UPDATE_LOCATION(id), data);
  },

  /**
   * Add Instagram embed to a location
   */
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

  /**
   * Upload files to a location with progress tracking
   */
  async uploadFiles(
    locationId: number,
    files: File[],
    photographerCredit?: string,
    onProgress?: (percent: number) => void
  ): Promise<UploadResponse["entry"]> {
    const formData = new FormData();

    if (photographerCredit) {
      formData.append("photographerCredit", photographerCredit);
    }

    files.forEach((file) => {
      formData.append("files", file);
    });

    // Use XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText) as UploadResponse;
            resolve(unwrapEntry(response));
          } catch (error) {
            reject(new Error("Failed to parse response"));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Upload failed")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

      xhr.open("POST", `${API_BASE_URL}${API_ENDPOINTS.ADD_UPLOAD(locationId)}`);
      xhr.send(formData);
    });
  },

  /**
   * Upload image set (source + 5 variants) to a location with progress tracking
   */
  async uploadImageSet(
    locationId: number,
    sourceFile: File,
    variantFiles: { type: ImageVariantType; file: File }[],
    photographerCredit?: string,
    onProgress?: (percent: number) => void,
    altText?: string
  ): Promise<UploadResponse["entry"]> {
    const formData = new FormData();

    if (photographerCredit) {
      formData.append("photographerCredit", photographerCredit);
    }

    if (altText) {
      formData.append("altText", altText);
    }

    // Append source file (currently only supporting 1 source per upload)
    formData.append("source_0", sourceFile);

    // Append all 5 variant files with naming convention: variant_0_{type}
    variantFiles.forEach(({ type, file }) => {
      formData.append(`variant_0_${type}`, file);
    });

    // Use XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText) as UploadResponse;
            resolve(unwrapEntry(response));
          } catch (error) {
            reject(new Error("Failed to parse response"));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Upload failed")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

      xhr.open("POST", `${API_BASE_URL}${API_ENDPOINTS.ADD_UPLOAD_IMAGESET(locationId)}`);
      xhr.send(formData);
    });
  },

  /**
   * Generate alt text for an image (preview before upload)
   */
  async generateAltText(imageFile: File): Promise<{ altText: string }> {
    const formData = new FormData();
    formData.append("image", imageFile);

    const response = await apiPostFormData<{ altText: string }>(
      API_ENDPOINTS.GENERATE_ALT_TEXT,
      formData
    );

    return response;
  },

  /**
   * Delete an Instagram embed by ID
   */
  async deleteInstagramEmbed(embedId: number): Promise<void> {
    await apiDelete(API_ENDPOINTS.DELETE_INSTAGRAM_EMBED(embedId));
  },

  /**
   * Delete an upload by ID
   */
  async deleteUpload(uploadId: number): Promise<void> {
    await apiDelete(API_ENDPOINTS.DELETE_UPLOAD(uploadId));
  },

  /**
   * Clear the entire database
   */
  async clearDatabase(): Promise<SuccessResponse> {
    return apiGet<SuccessResponse>(API_ENDPOINTS.CLEAR_DB);
  },

  /**
   * Get a single location by ID with full details
   */
  async getLocationById(id: number): Promise<LocationResponse> {
    return apiGet<LocationResponse>(API_ENDPOINTS.GET_LOCATION_BY_ID(id));
  },

  /**
   * Delete a location by ID
   */
  async deleteLocation(id: number): Promise<SuccessResponse> {
    return apiDelete<SuccessResponse>(API_ENDPOINTS.DELETE_LOCATION(id));
  },

  /**
   * Refetch Place ID from Google for a location
   */
  async refetchPlaceId(id: number): Promise<{ placeId: string | null; message: string }> {
    return apiPost<{ placeId: string | null; message: string }>(
      API_ENDPOINTS.REFETCH_PLACE_ID(id),
      {}
    );
  },

  /**
   * Fetch reviews for a location from Google
   */
  async fetchReviews(id: number, params: FetchReviewsRequest): Promise<FetchReviewsResponse["data"]> {
    return apiPost<FetchReviewsResponse["data"]>(
      API_ENDPOINTS.FETCH_REVIEWS(id),
      params
    );
  },

  /**
   * Fetch reviews from selected sources, then translate and merge into a single dataset
   */
  async fetchReviewsPipeline(
    id: number,
    params: FetchReviewsPipelineRequest
  ): Promise<FetchReviewsPipelineStartResponse["data"]> {
    return apiPost<FetchReviewsPipelineStartResponse["data"]>(
      API_ENDPOINTS.FETCH_REVIEWS_PIPELINE(id),
      params
    );
  },

  /**
   * Get reviews pipeline job status
   */
  async getReviewsPipelineStatus(
    id: number,
    jobId: string
  ): Promise<ReviewsPipelineJobStatus> {
    return apiGet<FetchReviewsPipelineStatusResponse["data"]>(
      API_ENDPOINTS.REVIEWS_PIPELINE_STATUS(id, jobId)
    );
  },

  /**
   * Get reviews download URL for a location
   */
  getReviewsDownloadUrl(id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_REVIEWS(id)}`;
  },

  /**
   * Check if reviews exist for a location
   */
  async getReviewsStatus(id: number): Promise<ReviewsStatusResponse["data"]> {
    return apiGet<ReviewsStatusResponse["data"]>(
      API_ENDPOINTS.REVIEWS_STATUS(id)
    );
  },

  // ============================================================================
  // TRIPADVISOR REVIEWS
  // ============================================================================

  /**
   * Fetch TripAdvisor reviews for a location
   */
  async fetchTripAdvisorReviews(
    id: number,
    params: FetchTripAdvisorReviewsRequest
  ): Promise<FetchTripAdvisorReviewsResponse["data"]> {
    return apiPost<FetchTripAdvisorReviewsResponse["data"]>(
      API_ENDPOINTS.FETCH_TRIPADVISOR_REVIEWS(id),
      params
    );
  },

  /**
   * Get TripAdvisor reviews download URL for a location
   * @param lang Optional language code to download specific language, or all if not specified
   */
  getTripAdvisorReviewsDownloadUrl(id: number, lang?: string): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_TRIPADVISOR_REVIEWS(id, lang)}`;
  },

  /**
   * Check if TripAdvisor reviews exist for a location
   */
  async getTripAdvisorReviewsStatus(
    id: number
  ): Promise<TripAdvisorReviewsStatusResponse["data"]> {
    return apiGet<TripAdvisorReviewsStatusResponse["data"]>(
      API_ENDPOINTS.TRIPADVISOR_REVIEWS_STATUS(id)
    );
  },

  // ============================================================================
  // MERGED REVIEWS (TRANSLATE & MERGE)
  // ============================================================================

  /**
   * Translate and merge all reviews (Google + TripAdvisor) for a location
   */
  async translateAndMergeReviews(
    id: number
  ): Promise<TranslateMergeReviewsResponse["data"]> {
    return apiPost<TranslateMergeReviewsResponse["data"]>(
      API_ENDPOINTS.TRANSLATE_MERGE_REVIEWS(id),
      {}
    );
  },

  /**
   * Get merged reviews download URL for a location
   */
  getMergedReviewsDownloadUrl(id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_MERGED_REVIEWS(id)}`;
  },

  /**
   * Check if merged reviews exist for a location
   */
  async getMergedReviewsStatus(
    id: number
  ): Promise<MergedReviewsStatusResponse["data"]> {
    return apiGet<MergedReviewsStatusResponse["data"]>(
      API_ENDPOINTS.MERGED_REVIEWS_STATUS(id)
    );
  },

  /**
   * Get rejects report download URL for a location
   */
  getRejectsReportDownloadUrl(id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_REJECTS_REPORT(id)}`;
  },
};
