import { NotFoundError, ServiceUnavailableError } from "@shared/errors/http-error";
import type { Tour } from "../../../models/location";
import {
  getAllTours,
  getAttractionTours,
  getTourById,
  getTourSyncState,
  saveTourSyncState,
} from "../../../repositories/core";
import type { PayloadApiClient } from "../clients/payload-api.client";
import type { PayloadTourData } from "../clients/payload/payload-tour.types";
import { ensurePayloadLocationRefForKey } from "../resolvers/payload-location.resolver";
import type { TourPayloadSyncResult } from "../types";

/** Creates, updates, and batches Payload tour documents. */
export class TourPayloadSyncService {
  constructor(private readonly payloadClient: PayloadApiClient) {}

  async syncTourToPayload(tourId: number): Promise<TourPayloadSyncResult> {
    if (!this.payloadClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const tour = getTourById(tourId);
    if (!tour) {
      throw new NotFoundError("Tour", tourId);
    }

    saveTourSyncState(tourId, "", "pending");

    try {
      const payloadData = await this.buildPayloadData(tour);
      const existingSyncState = getTourSyncState(tourId);
      const existingDocId =
        existingSyncState?.payloadDocId ||
        (await this.payloadClient.findTourByTitle(tour.title));

      const response = existingDocId
        ? await this.payloadClient.updateTour(existingDocId, payloadData)
        : await this.payloadClient.createTour(payloadData);

      saveTourSyncState(
        tourId,
        response.doc.id,
        "success",
        undefined,
        this.sqliteTimestamp()
      );
      return { tourId, payloadDocId: response.doc.id, status: "success" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      saveTourSyncState(tourId, "", "failed", errorMessage);
      return { tourId, payloadDocId: "", status: "failed", error: errorMessage };
    }
  }

  async syncAllTours(): Promise<void> {
    for (const tour of getAllTours()) {
      await this.syncTourOrThrow(tour.id);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async syncLinkedTours(locationId: number): Promise<string[]> {
    const payloadIds: string[] = [];

    for (const tour of getAttractionTours(locationId)) {
      payloadIds.push(await this.syncTourOrThrow(tour.id));
    }

    return payloadIds;
  }

  private async syncTourOrThrow(tourId: number): Promise<string> {
    const result = await this.syncTourToPayload(tourId);
    if (result.status === "failed") {
      throw new Error(result.error || `Failed to sync tour ${tourId}`);
    }
    return result.payloadDocId;
  }

  private async buildPayloadData(tour: Tour): Promise<PayloadTourData> {
    const payloadData: PayloadTourData = {
      title: tour.title,
      img: this.toRelationshipId(tour.imgPayloadMediaSetId),
      bookingLink: tour.bookingLink,
      price: tour.price,
      status: "published",
    };
    const locationRef = await ensurePayloadLocationRefForKey(
      tour.locationKey,
      this.payloadClient
    );
    if (locationRef) {
      payloadData.locationRef = this.toRelationshipId(locationRef);
    }
    return payloadData;
  }

  private toRelationshipId(id: string): string | number {
    const trimmed = id.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
  }

  private sqliteTimestamp(): string {
    const now = new Date();
    now.setMilliseconds(0);
    return now.toISOString().replace("T", " ").replace(".000Z", "");
  }
}
