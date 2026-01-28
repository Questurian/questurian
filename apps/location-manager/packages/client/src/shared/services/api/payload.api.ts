/**
 * Payload CMS sync API
 */

import { apiPost, apiGet } from "./client";
import { API_ENDPOINTS } from "./config";
import type { Category } from "./types";

export interface SyncResult {
  locationId: number;
  payloadDocId: string;
  status: "success" | "failed";
  error?: string;
}

export interface SyncStatusResponse {
  locationId: number;
  title: string;
  category: Category;
  synced: boolean;
  needsResync: boolean; // true if location has been modified since last successful sync
  syncState?: {
    id: number;
    location_id: number;
    payload_collection: string;
    payload_doc_id: string;
    last_synced_at: string;
    sync_status: "success" | "failed" | "pending";
    error_message: string | null;
  };
}

export interface SyncLocationResponse {
  result: SyncResult;
}

export interface SyncAllResponse {
  results: SyncResult[];
}

export interface GetSyncStatusResponse {
  status: SyncStatusResponse[];
}

export interface ConnectionStatusResponse {
  connected: boolean;
  message?: string;
  error?: string;
}

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
  async syncAll(category?: Category): Promise<SyncResult[]> {
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
