import type { Category } from "./common.types";

export type PayloadSyncCategory = Category;

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
