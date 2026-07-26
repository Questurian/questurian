import { NotFoundError, ServiceUnavailableError } from "@shared/errors/http-error";
import type { ImageStorageService } from "../../storage/image-storage.service";
import type { LocationQueryService } from "../../core/location-query.service";
import type { PayloadApiClient } from "../clients/payload-api.client";
import { uploadLocationImages } from "../handlers";
import { mapLocationToPayloadFormat } from "../mappers";
import type { SyncResult } from "../types";
import type { LocationPayloadSyncStateService } from "./location-payload-sync-state.service";
import type { PayloadCollectionResolver } from "./payload-collection.resolver";
import type { PayloadEntryUpsertService } from "./payload-entry-upsert.service";
import type { PayloadLocationRefService } from "./payload-location-ref.service";
import type { TourPayloadSyncService } from "./tour-payload-sync.service";

interface LocationSyncDiagnostics {
  locationRef: string | null;
  locationRefSource: string;
  galleryIds: string[];
  instagramIds: string[];
}

/** Executes the steps needed to synchronize one location. */
export class LocationPayloadSyncService {
  constructor(
    private readonly payloadClient: PayloadApiClient,
    private readonly imageStorage: ImageStorageService,
    private readonly locationQuery: LocationQueryService,
    private readonly collectionResolver: PayloadCollectionResolver,
    private readonly locationRef: PayloadLocationRefService,
    private readonly tourSync: TourPayloadSyncService,
    private readonly entryUpsert: PayloadEntryUpsertService,
    private readonly syncState: LocationPayloadSyncStateService
  ) {}

  async syncLocation(locationId: number): Promise<SyncResult> {
    if (!this.payloadClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const diagnostics: LocationSyncDiagnostics = {
      locationRef: null,
      locationRefSource: "unknown",
      galleryIds: [],
      instagramIds: [],
    };

    try {
      const collection = this.collectionResolver.forLocation(locationId);
      this.syncState.markPending(locationId, collection);

      const location = this.locationQuery.getLocationById(locationId);
      if (!location) {
        throw new NotFoundError("Location", locationId);
      }

      diagnostics.locationRef = location.payload_location_ref;
      diagnostics.locationRefSource = diagnostics.locationRef ? "stored" : "pending-resolve";
      if (!diagnostics.locationRef) {
        diagnostics.locationRefSource = "auto-resolved (was null)";
      }
      const resolvedRef = await this.locationRef.resolve(location);
      diagnostics.locationRef = resolvedRef.value;
      diagnostics.locationRefSource = resolvedRef.source;

      // Downstream upload behavior reads the in-memory ref.
      location.payload_location_ref = resolvedRef.value;
      const uploadedImages = await uploadLocationImages(
        location,
        this.payloadClient,
        this.imageStorage,
        resolvedRef.value
      );
      diagnostics.galleryIds = uploadedImages.galleryImageIds;
      diagnostics.instagramIds = uploadedImages.instagramPostIds;

      const tourPayloadIds =
        location.category === "attractions"
          ? await this.tourSync.syncLinkedTours(locationId)
          : undefined;
      const payloadData = mapLocationToPayloadFormat(
        location,
        uploadedImages,
        resolvedRef.value,
        { tourPayloadIds }
      );

      console.log(`🔄 [SYNC] Location ${locationId} type value:`, location.type);
      console.log("🔄 [SYNC] Payload data type:", payloadData.type);

      const existingDocId = this.syncState.getExistingDocumentId(locationId, collection);
      console.log(
        existingDocId
          ? `✓ Updating existing Payload document: ${existingDocId}`
          : "✓ Creating new Payload document"
      );
      console.log(`🔍 [SYNC DIAGNOSTICS] location ${locationId} → ${collection}`, {
        operation: existingDocId ? `PATCH ${existingDocId}` : "POST (new)",
        locationRef: payloadData.locationRef,
        locationRefSource: diagnostics.locationRefSource,
        locationKey: location.locationKey,
        galleryIds: uploadedImages.galleryImageIds,
        instagramIds: uploadedImages.instagramPostIds,
        galleryCount: uploadedImages.galleryImageIds.length,
        instagramCount: uploadedImages.instagramPostIds.length,
      });

      const response = await this.entryUpsert.upsertWithTypeFallback(
        collection,
        payloadData,
        existingDocId
      );
      console.log(`📄 Payload document ID: ${response.doc.id} (location ${locationId})`);

      if (uploadedImages.galleryUploadFailures > 0) {
        return this.syncState.markGalleryIncomplete(
          locationId,
          collection,
          response.doc.id,
          uploadedImages.galleryUploadFailures
        );
      }

      return this.syncState.markSuccess(locationId, collection, response.doc.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const diagnosticMessage = this.formatDiagnostics(diagnostics);
      const failureMessage = `${errorMessage} ${diagnosticMessage}`;
      console.error(`❌ Failed to sync location ${locationId}: ${failureMessage}`);

      try {
        const collection = this.collectionResolver.forLocation(locationId);
        return this.syncState.markFailure(locationId, collection, failureMessage);
      } catch {
        return {
          locationId,
          payloadDocId: "",
          status: "failed",
          error: failureMessage,
        };
      }
    }
  }

  private formatDiagnostics(diagnostics: LocationSyncDiagnostics): string {
    return (
      `[locationRef=${diagnostics.locationRef ?? "null"} ` +
      `source=${diagnostics.locationRefSource} ` +
      `gallery=[${diagnostics.galleryIds.join(",")}] ` +
      `instagram=[${diagnostics.instagramIds.join(",")}]]`
    );
  }
}
