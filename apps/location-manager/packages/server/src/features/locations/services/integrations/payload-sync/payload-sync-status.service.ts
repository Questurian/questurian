import { NotFoundError } from "@shared/errors/http-error";
import type { LocationResponse } from "../../../models/location";
import * as PayloadSyncRepo from "../../../repositories/integration";
import type { LocationQueryService } from "../../core/location-query.service";
import type { SyncStatusResponse } from "../types";
import type { PayloadCollectionResolver } from "./payload-collection.resolver";
import { hasLocationChangedSinceLastSync } from "./payload-sync-change-detector";

/** Builds the public location sync status view. */
export class PayloadSyncStatusService {
  constructor(
    private readonly locationQuery: LocationQueryService,
    private readonly collectionResolver: PayloadCollectionResolver
  ) {}

  getSyncStatus(locationId?: number): SyncStatusResponse[] {
    if (locationId) {
      const location = this.locationQuery.getLocationById(locationId);
      if (!location) {
        throw new NotFoundError("Location", locationId);
      }

      const syncState = PayloadSyncRepo.getSyncState(
        locationId,
        this.collectionResolver.forCategory(location.category)
      );
      return [this.toStatus(location, syncState || undefined)];
    }

    const syncStateMap = new Map(
      PayloadSyncRepo.getAllSyncedLocations().map((state) => [state.location_id, state])
    );

    return this.locationQuery
      .listLocations()
      .map((location) => this.toStatus(location, syncStateMap.get(location.id)));
  }

  private toStatus(
    location: LocationResponse,
    syncState?: PayloadSyncRepo.PayloadSyncState
  ): SyncStatusResponse {
    return {
      locationId: location.id,
      title: location.title || location.source.name,
      category: location.category,
      synced: syncState?.sync_status === "success",
      needsResync: hasLocationChangedSinceLastSync(location, syncState),
      syncState,
    };
  }
}
