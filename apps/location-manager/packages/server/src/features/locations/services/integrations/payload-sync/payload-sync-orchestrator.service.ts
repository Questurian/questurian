import { ServiceUnavailableError } from "@shared/errors/http-error";
import type { LocationCategory } from "../../../models/location";
import type { LocationQueryService } from "../../core/location-query.service";
import type { PayloadApiClient } from "../clients/payload-api.client";
import type { SyncResult } from "../types";
import type { LocationPayloadSyncService } from "./location-payload-sync.service";
import type { TourPayloadSyncService } from "./tour-payload-sync.service";

/** Coordinates batch ordering and throttling without owning per-entity sync policy. */
export class PayloadSyncOrchestratorService {
  constructor(
    private readonly payloadClient: PayloadApiClient,
    private readonly locationQuery: LocationQueryService,
    private readonly locationSync: LocationPayloadSyncService,
    private readonly tourSync: TourPayloadSyncService
  ) {}

  async syncAllLocations(category?: LocationCategory): Promise<SyncResult[]> {
    if (!this.payloadClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    if (category === undefined || category === "attractions") {
      await this.tourSync.syncAllTours();
    }

    const results: SyncResult[] = [];
    for (const location of this.locationQuery.listLocations(category)) {
      results.push(await this.locationSync.syncLocation(location.id));
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  }
}
