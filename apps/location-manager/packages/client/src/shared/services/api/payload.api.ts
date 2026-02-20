/**
 * Payload CMS sync API
 */

import { apiPost, apiGet } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  PayloadSyncCategory,
  SyncResult,
  SyncLocationResponse,
  SyncAllResponse,
  GetSyncStatusResponse,
  SyncStatusResponse,
  ConnectionStatusResponse,
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
   * Test connection to Payload CMS
   */
  async testConnection(): Promise<ConnectionStatusResponse> {
    return apiGet<ConnectionStatusResponse>(API_ENDPOINTS.PAYLOAD_TEST_CONNECTION);
  },
};
