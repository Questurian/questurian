/**
 * One-off backfill: turn previously-downloaded Instagram embed images into
 * reviewable StagedSources WITHOUT calling the (quota-limited) Instagram API.
 *
 * Existing embeds already have their photos on disk in `embed.images[]` (saved
 * by the old download path). The current API-based `stageEmbedMedia` re-fetches
 * everything from RapidAPI, which is 429/quota-blocked. This script stages each
 * on-disk image directly, promoting embeds to `ready` so their photos appear in
 * the "Awaiting Review" pipeline. Video/reel posts never produced local images,
 * so an embed with no images on disk is left untouched (needs the API path).
 *
 * Idempotent: re-running skips items already staged. Run:
 *   bun run scripts/backfill-instagram-staging-from-disk.ts
 */
import type { ImageSet } from "@questurian/lm-shared";
import { closeDb, initDb } from "../src/shared/db/client";
import { CURRENT_INSTAGRAM_MEDIA_STAGING_VERSION } from "../src/features/locations/constants/instagram-staging";
import type { ImageSetUpload, InstagramEmbed } from "../src/features/locations/models/location";
import { getLocationById } from "../src/features/locations/repositories/core";
import {
  getInstagramEmbedsForBackfill,
  getUploadByInstagramItem,
  saveInstagramEmbed,
  saveUpload,
} from "../src/features/locations/repositories/content";
import { ImageStorageService } from "../src/features/locations/services/storage/image-storage.service";

export interface DiskBackfillResult {
  embedsConsidered: number;
  embedsStaged: number;
  embedsSkippedNoImages: number;
  itemsStaged: number;
  itemsAlreadyStaged: number;
  itemsFailed: number;
}

function legacyMediaKey(index: number): string {
  return `legacy-${index}`;
}

async function stageEmbedFromDisk(
  embed: InstagramEmbed,
  storage: ImageStorageService,
  result: DiskBackfillResult,
): Promise<void> {
  const images = embed.images ?? [];
  if (images.length === 0) {
    result.embedsSkippedNoImages++;
    return;
  }

  const location = getLocationById(embed.location_id);
  if (!location) {
    console.warn(`  embed ${embed.id}: location ${embed.location_id} missing, skipping`);
    return;
  }
  const photographerCredit = location.title || location.name;

  let readyCount = 0;
  let failedCount = 0;

  for (let index = 0; index < images.length; index++) {
    const imagePath = images[index]!;
    const mediaKey = legacyMediaKey(index);

    const existing = getUploadByInstagramItem(embed.id!, mediaKey) as ImageSetUpload | null;
    if (existing?.imageSet?.sourceImage?.path && existing.stagedSourceStatus === "ready") {
      readyCount++;
      result.itemsAlreadyStaged++;
      continue;
    }

    try {
      const timestamp = `${Date.now()}-${embed.id}-${mediaKey}`;
      const storagePath = storage.createStoragePath(location.name, "uploads", timestamp);
      const source = await storage.saveSanitizedImageFromFile(imagePath, storagePath);
      const imageSet: ImageSet = {
        id: `instagram-${embed.id}-${mediaKey}`,
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
      const upload: ImageSetUpload = {
        id: existing?.id,
        location_id: embed.location_id,
        format: "imageset",
        stagedSourceStatus: "ready",
        errorMessage: null,
        sourceKind: "instagram",
        instagramEmbedId: embed.id!,
        instagramMediaKey: mediaKey,
        sourcePosition: index,
        sourceUrl: embed.original_image_urls?.[index] ?? null,
        imageSet,
      };
      saveUpload(upload);
      readyCount++;
      result.itemsStaged++;
    } catch (error) {
      failedCount++;
      result.itemsFailed++;
      console.warn(`  embed ${embed.id} image ${index} (${imagePath}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  embed.media_item_count = images.length;
  embed.staged_item_count = readyCount;
  embed.media_staging_version = CURRENT_INSTAGRAM_MEDIA_STAGING_VERSION;
  embed.media_staging_status = failedCount === 0 ? "ready" : readyCount > 0 ? "partial" : "failed";
  embed.media_staging_error = failedCount > 0 ? `${failedCount} image${failedCount === 1 ? "" : "s"} failed to stage from disk` : null;
  saveInstagramEmbed(embed);

  if (readyCount > 0) result.embedsStaged++;
}

export async function backfillInstagramStagingFromDisk(): Promise<DiskBackfillResult> {
  const storage = new ImageStorageService();
  const embeds = getInstagramEmbedsForBackfill();
  const result: DiskBackfillResult = {
    embedsConsidered: embeds.length,
    embedsStaged: 0,
    embedsSkippedNoImages: 0,
    itemsStaged: 0,
    itemsAlreadyStaged: 0,
    itemsFailed: 0,
  };

  for (let i = 0; i < embeds.length; i++) {
    const embed = embeds[i]!;
    if ((i + 1) % 25 === 0 || i === 0) {
      console.log(`  ...processing embed ${i + 1}/${embeds.length} (id ${embed.id})`);
    }
    await stageEmbedFromDisk(embed, storage, result);
  }

  return result;
}

async function main() {
  console.log("📸 Backfilling Instagram staging from on-disk images (no API calls)...\n");
  initDb();
  const result = await backfillInstagramStagingFromDisk();
  console.log("\n✅ Disk backfill complete:");
  console.log(`   Embeds considered:        ${result.embedsConsidered}`);
  console.log(`   Embeds staged (ready):    ${result.embedsStaged}`);
  console.log(`   Embeds skipped (no imgs): ${result.embedsSkippedNoImages}`);
  console.log(`   StagedSources created:    ${result.itemsStaged}`);
  console.log(`   Already staged (skipped): ${result.itemsAlreadyStaged}`);
  console.log(`   Items failed:             ${result.itemsFailed}`);
}

if (import.meta.main) {
  main()
    .catch((error) => {
      console.error("❌ Disk backfill failed:", error);
      process.exitCode = 1;
    })
    .finally(() => {
      closeDb();
    });
}
