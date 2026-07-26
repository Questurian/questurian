import { updateLocationById } from "../../../repositories/core";
import * as PayloadSyncRepo from "../../../repositories/integration";
import type { LocationQueryService } from "../../core/location-query.service";
import type { PayloadCollection } from "../mappers/location-payload.mapper";
import type { SyncResult } from "../types";

/** Owns location sync-state transitions and their timestamp invariant. */
export class LocationPayloadSyncStateService {
  constructor(private readonly locationQuery: LocationQueryService) {}

  markPending(locationId: number, collection: PayloadCollection): void {
    PayloadSyncRepo.saveSyncState(locationId, collection, "", "pending");
  }

  getExistingDocumentId(locationId: number, collection: PayloadCollection): string | undefined {
    return PayloadSyncRepo.getSyncState(locationId, collection)?.payload_doc_id || undefined;
  }

  markGalleryIncomplete(
    locationId: number,
    collection: PayloadCollection,
    payloadDocId: string,
    failureCount: number
  ): SyncResult {
    const message =
      `Gallery upload incomplete: ${failureCount} image set(s) failed to upload to Payload. ` +
      `Document ${payloadDocId} was saved with a partial gallery — re-run sync to retry.`;
    console.error(`❌ [SYNC] Location ${locationId}: ${message}`);

    // Preserve the real document id and leave updated_at ahead of last_synced_at.
    PayloadSyncRepo.saveSyncState(locationId, collection, payloadDocId, "failed", message);
    return {
      locationId,
      payloadDocId,
      status: "failed",
      error: message,
    };
  }

  markSuccess(
    locationId: number,
    collection: PayloadCollection,
    payloadDocId: string
  ): SyncResult {
    const syncTimestamp = this.sqliteTimestamp();
    console.log(`🕐 Generated sync timestamp (SQLite format): ${syncTimestamp}`);

    const updateSuccess = updateLocationById(locationId, {
      updated_at: syncTimestamp,
    });
    console.log(
      `📝 Updated location ${locationId} updated_at: ${
        updateSuccess ? syncTimestamp : "FAILED"
      }`
    );

    PayloadSyncRepo.saveSyncState(
      locationId,
      collection,
      payloadDocId,
      "success",
      undefined,
      syncTimestamp
    );
    console.log(`💾 Saved sync state for location ${locationId} with timestamp: ${syncTimestamp}`);

    const verifyLocation = this.locationQuery.getLocationById(locationId);
    const verifySyncState = PayloadSyncRepo.getSyncState(locationId, collection);
    console.log(`✅ VERIFICATION for location ${locationId}:`);
    console.log(`   DB location.updated_at: ${verifyLocation?.updated_at}`);
    console.log(`   DB syncState.last_synced_at: ${verifySyncState?.last_synced_at}`);
    console.log(
      `   Match: ${verifyLocation?.updated_at === verifySyncState?.last_synced_at}`
    );

    return {
      locationId,
      payloadDocId,
      status: "success",
    };
  }

  markFailure(
    locationId: number,
    collection: PayloadCollection,
    error: string
  ): SyncResult {
    PayloadSyncRepo.saveSyncState(locationId, collection, "", "failed", error);
    return {
      locationId,
      payloadDocId: "",
      status: "failed",
      error,
    };
  }

  private sqliteTimestamp(): string {
    const now = new Date();
    now.setMilliseconds(0);
    return now.toISOString().replace("T", " ").replace(".000Z", "");
  }
}
