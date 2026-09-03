import type { ImageSet, InstagramMediaStagingStatus } from "@questurian/lm-shared";
import { CURRENT_INSTAGRAM_MEDIA_STAGING_VERSION } from "../../constants/instagram-staging";
import type { InstagramEmbed, ImageSetUpload } from "../../models/location";
import { getLocationById, updateLocationById } from "../../repositories/core";
import {
  getInstagramEmbedById,
  getInstagramEmbedsForBackfill,
  getUploadByInstagramItem,
  isInstagramMediaRejected,
  saveInstagramEmbed,
  saveUpload,
} from "../../repositories/content";
import { InstagramApiClient, InstagramApiError, type InstagramMediaItem } from "./clients/instagram-api.client";
import { ImageStorageService } from "../storage/image-storage.service";
import { setInstagramApiQuota } from "@server/shared/settings/instagram-api-quota";

const BACKFILL_INTERVAL_MS = 20_000;
const RATE_LIMIT_RETRY_MS = 60 * 60 * 1000;

export class InstagramImageStagingService {
  constructor(
    private readonly apiClient: InstagramApiClient,
    private readonly imageStorage: ImageStorageService,
  ) {}

  isConfigured(): boolean {
    return this.apiClient.isConfigured();
  }

  async stageEmbedMedia(embedId: number): Promise<InstagramEmbed> {
    const embed = getInstagramEmbedById(embedId);
    if (!embed) throw new Error(`Instagram embed ${embedId} not found`);
    const location = getLocationById(embed.location_id);
    if (!location) throw new Error(`Location ${embed.location_id} not found`);

    embed.media_staging_status = "processing";
    embed.media_staging_error = null;
    saveInstagramEmbed(embed);

    try {
      const media = await this.apiClient.fetchMediaUrls(embed.url);
      setInstagramApiQuota(media.quota);
      embed.media_item_count = media.items.length;
      await this.ensurePrivatePreview(embed, location.name, media.imageUrls);

      if (media.eligibility !== "photos-only") {
        embed.media_staging_status = "skipped";
        embed.media_staging_version = CURRENT_INSTAGRAM_MEDIA_STAGING_VERSION;
        embed.staged_item_count = 0;
        saveInstagramEmbed(embed);
        return embed;
      }

      let readyCount = 0;
      let failedCount = 0;
      for (const item of media.items) {
        if (isInstagramMediaRejected(embed.id!, item.key)) continue;
        const ready = await this.stageItem(embed, item, location.name, location.title || location.name);
        if (ready) readyCount++;
        else failedCount++;
        embed.staged_item_count = readyCount;
        saveInstagramEmbed(embed);
      }

      embed.media_staging_status = this.resolveStatus(readyCount, failedCount);
      embed.media_staging_version = CURRENT_INSTAGRAM_MEDIA_STAGING_VERSION;
      embed.media_staging_error = failedCount > 0 ? `${failedCount} image${failedCount === 1 ? "" : "s"} failed to stage` : null;
      embed.staged_item_count = readyCount;
      saveInstagramEmbed(embed);
      this.touchLocationUpdatedAt(embed.location_id);
      return embed;
    } catch (error) {
      if (error instanceof InstagramApiError) setInstagramApiQuota(error.quota);
      const rateLimited = error instanceof InstagramApiError && error.status === 429;
      embed.media_staging_status = rateLimited ? "pending" : "failed";
      embed.media_staging_version = rateLimited ? null : CURRENT_INSTAGRAM_MEDIA_STAGING_VERSION;
      embed.media_staging_error = error instanceof Error ? error.message : String(error);
      saveInstagramEmbed(embed);
      this.touchLocationUpdatedAt(embed.location_id);
      return embed;
    }
  }

  async backfillExistingEmbeds(): Promise<void> {
    if (!this.isConfigured()) return;
    const embeds = getInstagramEmbedsForBackfill();
    for (let index = 0; index < embeds.length; index++) {
      const result = await this.stageEmbedMedia(embeds[index]!.id!);
      if (result.media_staging_status === "pending") {
        await this.delay(RATE_LIMIT_RETRY_MS);
        index--;
        continue;
      }
      if (index < embeds.length - 1) await this.delay(BACKFILL_INTERVAL_MS);
    }
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private async stageItem(
    embed: InstagramEmbed,
    item: InstagramMediaItem,
    locationName: string,
    photographerCredit: string,
  ): Promise<boolean> {
    let upload = getUploadByInstagramItem(embed.id!, item.key) as ImageSetUpload | null;
    if (upload?.imageSet?.sourceImage?.path && upload.stagedSourceStatus === "ready") return true;

    if (!upload) {
      upload = {
        location_id: embed.location_id,
        format: "imageset",
        stagedSourceStatus: "downloading",
        sourceKind: "instagram",
        instagramEmbedId: embed.id!,
        instagramMediaKey: item.key,
        sourcePosition: item.position,
        sourceUrl: item.imageUrl,
      };
      const savedId = saveUpload(upload);
      if (typeof savedId !== "number") return false;
      upload.id = savedId;
    } else {
      upload.stagedSourceStatus = "downloading";
      upload.errorMessage = null;
      saveUpload(upload);
    }

    if (!item.imageUrl) {
      upload.stagedSourceStatus = "failed";
      upload.errorMessage = "Instagram provider returned no downloadable image URL";
      saveUpload(upload);
      return false;
    }

    try {
      const timestamp = `${Date.now()}-${embed.id}-${item.position}`;
      const storagePath = this.imageStorage.createStoragePath(locationName, "uploads", timestamp);
      const source = await this.imageStorage.saveSanitizedImageFromUrl(item.imageUrl, storagePath);
      const imageSet: ImageSet = {
        id: `instagram-${embed.id}-${item.key}`,
        sourceImage: {
          path: source.path,
          dimensions: { width: source.metadata.width, height: source.metadata.height },
          size: source.metadata.size,
          format: source.metadata.format,
        },
        variants: [],
        photographerCredit,
        created_at: new Date().toISOString(),
      };
      upload.imageSet = imageSet;
      upload.stagedSourceStatus = "ready";
      upload.errorMessage = null;
      saveUpload(upload);
      return true;
    } catch (error) {
      upload.stagedSourceStatus = "failed";
      upload.errorMessage = error instanceof Error ? error.message : String(error);
      saveUpload(upload);
      return false;
    }
  }

  private async ensurePrivatePreview(embed: InstagramEmbed, locationName: string, urls: string[]): Promise<void> {
    if ((embed.images?.length ?? 0) > 0) {
      embed.images = embed.images!.slice(0, 1);
      embed.original_image_urls = embed.original_image_urls?.slice(0, 1) ?? [];
      saveInstagramEmbed(embed);
      return;
    }
    const previewUrls = urls.slice(0, 1);
    if (previewUrls.length === 0) return;
    const storagePath = this.imageStorage.createStoragePath(locationName, "instagram", Date.now());
    const { savedPaths } = await this.imageStorage.saveImagesFromUrls(previewUrls, storagePath);
    if (savedPaths.length > 0) {
      embed.images = savedPaths.slice(0, 1);
      embed.original_image_urls = previewUrls;
      saveInstagramEmbed(embed);
    }
  }

  private resolveStatus(ready: number, failed: number): InstagramMediaStagingStatus {
    if (failed === 0) return "ready";
    return ready > 0 ? "partial" : "failed";
  }

  private touchLocationUpdatedAt(locationId: number): void {
    updateLocationById(locationId, {
      updated_at: new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, ""),
    });
  }
}
