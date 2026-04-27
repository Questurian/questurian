/**
 * Payload CMS sync API
 */

import { apiPost, apiGet, apiDelete } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  PayloadSyncCategory,
  SyncResult,
  SyncLocationResponse,
  SyncAllResponse,
  PostSyncTourResponse,
  TourPayloadSyncResult,
  GetSyncStatusResponse,
  SyncStatusResponse,
  ConnectionStatusResponse,
  PayloadMediaSetsResponse,
} from "./types/payload.types";

export const payloadApi = {
  /**
   * Sync a single location to Payload CMS
   */
  async syncLocation(locationId: number): Promise<SyncResult> {
    const response = await apiPost<SyncLocationResponse>(
      API_ENDPOINTS.PAYLOAD_SYNC(locationId),
      {}
    );
    return response.result;
  },

  /**
   * Sync all locations to Payload CMS (optionally filtered by category)
   */
  async syncAll(category?: PayloadSyncCategory): Promise<SyncResult[]> {
    const response = await apiPost<SyncAllResponse>(
      API_ENDPOINTS.PAYLOAD_SYNC_ALL,
      { category }
    );
    return response.results;
  },

  async syncTour(tourId: number): Promise<TourPayloadSyncResult> {
    const response = await apiPost<PostSyncTourResponse>(API_ENDPOINTS.PAYLOAD_SYNC_TOUR(tourId), {});
    return response.result;
  },

  /**
   * Get sync status for a location or all locations
   */
  async getSyncStatus(locationId?: number): Promise<SyncStatusResponse[]> {
    const endpoint = locationId
      ? API_ENDPOINTS.PAYLOAD_SYNC_STATUS_BY_ID(locationId)
      : API_ENDPOINTS.PAYLOAD_SYNC_STATUS;

    const response = await apiGet<GetSyncStatusResponse>(endpoint);
    return response.status;
  },

  /**
   * Search existing Payload media sets
   */
  async getMediaSets(params?: {
    query?: string;
    page?: number;
    limit?: number;
    ids?: string[];
  }): Promise<PayloadMediaSetsResponse> {
    const searchParams: Record<string, string> = {};

    if (params?.query) {
      searchParams.query = params.query;
    }

    if (params?.page) {
      searchParams.page = String(params.page);
    }

    if (params?.limit) {
      searchParams.limit = String(params.limit);
    }

    if (params?.ids && params.ids.length > 0) {
      searchParams.ids = params.ids.join(",");
    }

    return apiGet<PayloadMediaSetsResponse>(API_ENDPOINTS.PAYLOAD_MEDIA_SETS, searchParams);
  },

  /**
   * Test connection to Payload CMS
   */
  async testConnection(): Promise<ConnectionStatusResponse> {
    return apiGet<ConnectionStatusResponse>(API_ENDPOINTS.PAYLOAD_TEST_CONNECTION);
  },

  /**
   * Reset sync state for a specific location or all locations
   */
  async resetSyncState(locationId?: number): Promise<void> {
    await apiDelete(API_ENDPOINTS.PAYLOAD_RESET_SYNC_STATE, { locationId });
  },
};
