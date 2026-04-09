import type { LocationCategory } from "../../../models/location";
import type { PayloadSyncState } from "../../../repositories/integration";

export interface SyncResult {
  locationId: number;
  payloadDocId: string;
  status: "success" | "failed";
  error?: string;
}

export interface SyncStatusResponse {
  locationId: number;
  title: string;
  category: LocationCategory;
  synced: boolean;
  needsResync: boolean; // true if location has been modified since last successful sync
  syncState?: PayloadSyncState;
}

export interface UploadedImagesResult {
  galleryImageIds: string[];      // Payload media-set IDs for uploaded image sets
  instagramPostIds: string[];     // Instagram post IDs for embeds
}




