import type { AddInstagramRequest, InstagramEmbed } from "../../models/location";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { ImageStorageService } from "../storage/image-storage.service";
import { InstagramApiClient } from "./clients/instagram-api.client";
import { createFromInstagram, extractInstagramData } from "./factories/instagram-embed.factory";
import { getLocationById, updateLocationById } from "../../repositories/core";
import {
  saveInstagramEmbed,
  getInstagramEmbedById,
  deleteInstagramEmbedById,
  getInstagramEmbedByLocationAndIdentity,
} from "../../repositories/content";
import { InstagramImageStagingService } from "./instagram-image-staging.service";

export class InstagramService {
  constructor(
    private readonly apiClient: InstagramApiClient,
    private readonly imageStorage: ImageStorageService,
    private readonly imageStaging = new InstagramImageStagingService(apiClient, imageStorage),
  ) {}

  async addInstagramEmbed(payload: AddInstagramRequest): Promise<InstagramEmbed> {
    // Validation
    if (!payload.embedCode) {
      throw new BadRequestError("Embed code required");
    }
    if (!payload.locationId) {
      throw new BadRequestError("Location ID required");
    }

    const parentLocation = getLocationById(payload.locationId);
    if (!parentLocation) {
      throw new NotFoundError("Location", payload.locationId);
    }

    const { url: instaUrl, author, identity } = extractInstagramData(payload.embedCode);
    if (!instaUrl) {
      throw new BadRequestError("Invalid embed code");
    }

    if (!author) {
      throw new BadRequestError(
        "Could not extract username from embed code. " +
        "Please ensure you copied the complete Instagram embed code."
      );
    }

    const existing = identity ? getInstagramEmbedByLocationAndIdentity(payload.locationId, identity) : null;
    if (existing) {
      if (this.imageStaging.isConfigured() && existing.media_staging_status !== "ready") {
        void this.imageStaging.stageEmbedMedia(existing.id!);
      }
      return existing;
    }

    // Create entry and save to DB
    const entry = createFromInstagram(payload.embedCode, payload.locationId);
    entry.media_staging_status = this.imageStaging.isConfigured() ? "pending" : "failed";
    entry.media_staging_error = this.imageStaging.isConfigured()
      ? null
      : "Instagram media provider is not configured";
    const savedId = saveInstagramEmbed(entry);
    if (typeof savedId === "number") {
      entry.id = savedId;
    }

    if (typeof savedId === "number" && this.imageStaging.isConfigured()) {
      void this.imageStaging.stageEmbedMedia(savedId);
    }

    // Instagram embeds are part of the Payload sync payload, so adding one
    // must flag the location as out-of-sync (mirrors UploadsService).
    this.touchLocationUpdatedAt(payload.locationId);

    // Return saved entry
    if (typeof savedId === "number") {
      const saved = getInstagramEmbedById(savedId);
      if (saved) return saved;
    }

    return entry;
  }

  retryMediaStaging(embedId: number): Promise<InstagramEmbed> {
    return this.imageStaging.stageEmbedMedia(embedId);
  }

  backfillExistingMedia(): Promise<void> {
    return this.imageStaging.backfillExistingEmbeds();
  }

  async deleteInstagramEmbed(id: number): Promise<void> {
    // 1. Get embed to extract file paths
    const embed = getInstagramEmbedById(id);
    if (!embed) {
      throw new NotFoundError("Instagram embed", id);
    }

    // 2. Delete from database
    const deleted = deleteInstagramEmbedById(id);
    if (!deleted) {
      throw new Error("Failed to delete Instagram embed");
    }

    // Removing an embed changes the Payload sync payload — flag for re-sync
    // before any early returns in the file-cleanup steps below.
    this.touchLocationUpdatedAt(embed.location_id);

    // 3. Extract path metadata from first image (if images exist)
    if (!embed.images || embed.images.length === 0) {
      return; // No files to clean up
    }

    const firstImage = embed.images[0];
    if (!firstImage) {
      return; // No valid image path to clean up
    }

    const metadata = this.imageStorage.extractPathMetadata(firstImage);
    if (!metadata) {
      return; // Cannot determine cleanup path
    }

    // 4. Delete timestamp folder and cleanup empty parents
    try {
      await this.imageStorage.deleteTimestampFolder(metadata.timestampDir);
      await this.imageStorage["cleanupEmptyFolders"](metadata.timestampDir);
    } catch (error) {
      console.error("File deletion failed for Instagram embed", { id, error });
    }
  }

  private touchLocationUpdatedAt(locationId: number): void {
    const updated = updateLocationById(locationId, {
      // Keep this format aligned with sync-state timestamps for stable comparison.
      updated_at: new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, ""),
    });

    if (!updated) {
      console.warn(`Failed to update location.updated_at after Instagram embed mutation (location: ${locationId})`);
    }
  }
}
