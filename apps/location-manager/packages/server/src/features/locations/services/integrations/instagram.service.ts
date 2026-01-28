import type { AddInstagramRequest, InstagramEmbed } from "../../models/location";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { ImageStorageService } from "@server/shared/services/storage/image-storage.service";
import { InstagramApiClient } from "@server/shared/services/external/instagram-api.client";
import { createFromInstagram, extractInstagramData } from "../geocoding/location-geocoding.helper";
import { getLocationById } from "../../repositories/core";
import {
  saveInstagramEmbed,
  getInstagramEmbedById,
  deleteInstagramEmbedById
} from "../../repositories/content";

export class InstagramService {
  constructor(
    private readonly apiClient: InstagramApiClient,
    private readonly imageStorage: ImageStorageService
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

    const { url: instaUrl, author } = extractInstagramData(payload.embedCode);
    if (!instaUrl) {
      throw new BadRequestError("Invalid embed code");
    }

    if (!author) {
      throw new BadRequestError(
        "Could not extract username from embed code. " +
        "Please ensure you copied the complete Instagram embed code."
      );
    }

    // Create entry and save to DB
    const entry = createFromInstagram(payload.embedCode, payload.locationId);
    const savedId = saveInstagramEmbed(entry);
    if (typeof savedId === "number") {
      entry.id = savedId;
    }

    // Download media if API is configured
    if (this.apiClient.isConfigured()) {
      try {
        const timestamp = Date.now();
        const storagePath = this.imageStorage.generateStoragePath({
          baseDir: this.imageStorage["baseImagesDir"],
          locationName: parentLocation.name,
          storageType: "instagram",
          timestamp
        });

        const mediaResponse = await this.apiClient.fetchMediaUrls(instaUrl);

        if (mediaResponse.imageUrls.length > 0) {
          const { savedPaths, errors } = await this.imageStorage.saveImagesFromUrls(
            mediaResponse.imageUrls,
            storagePath
          );

          if (errors.length > 0) {
            console.warn("Some images failed to download:", errors);
          }

          if (savedPaths.length > 0) {
            entry.images = savedPaths;
            entry.original_image_urls = mediaResponse.imageUrls;
            saveInstagramEmbed(entry);
          }
        }
      } catch (error) {
        console.error("Error fetching Instagram media:", error);
        // Don't fail the request if media download fails
      }
    }

    // Return saved entry
    if (typeof savedId === "number") {
      const saved = getInstagramEmbedById(savedId);
      if (saved) return saved;
    }

    return entry;
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
}
