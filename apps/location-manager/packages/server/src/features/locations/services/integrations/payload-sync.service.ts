import type { LocationCategory } from "../../models/location";
import type { ImageStorageService } from "../storage/image-storage.service";
import type { LocationQueryService } from "../core/location-query.service";
import type { PayloadApiClient } from "./clients/payload-api.client";
import { LocationPayloadSyncService } from "./payload-sync/location-payload-sync.service";
import { LocationPayloadSyncStateService } from "./payload-sync/location-payload-sync-state.service";
import { PayloadCollectionResolver } from "./payload-sync/payload-collection.resolver";
import { PayloadEntryUpsertService } from "./payload-sync/payload-entry-upsert.service";
import { PayloadLocationRefService } from "./payload-sync/payload-location-ref.service";
import { PayloadSyncOrchestratorService } from "./payload-sync/payload-sync-orchestrator.service";
import { PayloadSyncStatusService } from "./payload-sync/payload-sync-status.service";
import { TourPayloadSyncService } from "./payload-sync/tour-payload-sync.service";
import type { SyncResult, SyncStatusResponse, TourPayloadSyncResult } from "./types";

/**
 * Backwards-compatible facade for the Payload sync API used by controllers.
 *
 * Sync policies live in focused collaborators; this class only wires and delegates
 * the four public operations exposed by the existing service contract.
 */
export class PayloadSyncService {
  private readonly locationSync: LocationPayloadSyncService;
  private readonly orchestrator: PayloadSyncOrchestratorService;
  private readonly status: PayloadSyncStatusService;
  private readonly tourSync: TourPayloadSyncService;

  constructor(
    payloadClient: PayloadApiClient,
    imageStorage: ImageStorageService,
    locationQuery: LocationQueryService
  ) {
    const collectionResolver = new PayloadCollectionResolver(locationQuery);
    const entryUpsert = new PayloadEntryUpsertService(payloadClient);
    const locationRef = new PayloadLocationRefService(payloadClient);
    const locationSyncState = new LocationPayloadSyncStateService(locationQuery);

    this.tourSync = new TourPayloadSyncService(payloadClient);
    this.locationSync = new LocationPayloadSyncService(
      payloadClient,
      imageStorage,
      locationQuery,
      collectionResolver,
      locationRef,
      this.tourSync,
      entryUpsert,
      locationSyncState
    );
    this.orchestrator = new PayloadSyncOrchestratorService(
      payloadClient,
      locationQuery,
      this.locationSync,
      this.tourSync
    );
    this.status = new PayloadSyncStatusService(locationQuery, collectionResolver);
  }

  syncLocation(locationId: number): Promise<SyncResult> {
    return this.locationSync.syncLocation(locationId);
  }

  syncAllLocations(category?: LocationCategory): Promise<SyncResult[]> {
    return this.orchestrator.syncAllLocations(category);
  }

  syncTourToPayload(tourId: number): Promise<TourPayloadSyncResult> {
    return this.tourSync.syncTourToPayload(tourId);
  }

  getSyncStatus(locationId?: number): SyncStatusResponse[] {
    return this.status.getSyncStatus(locationId);
  }
}
