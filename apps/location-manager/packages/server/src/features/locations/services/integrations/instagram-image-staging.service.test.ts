import { afterEach, describe, expect, mock, test } from "bun:test";
import type { InstagramEmbed, Upload } from "../../models/location";
import { InstagramApiError, type InstagramMediaResponse } from "./clients/instagram-api.client";
import { mockContentRepository, mockCoreRepository } from "../../../../test/repository-mocks";

let embed: InstagramEmbed = {
  id: 42,
  location_id: 7,
  username: "@place",
  url: "https://www.instagram.com/p/POST/",
  embed_code: "<blockquote></blockquote>",
  images: [],
  original_image_urls: [],
  media_staging_status: "pending",
};
const uploads: Upload[] = [];

mockCoreRepository({
  getLocationById: () => ({ id: 7, name: "Source Place", title: "Public Place" }),
  updateLocationById: () => true,
} as any);

mockContentRepository({
  getInstagramEmbedById: () => embed,
  getInstagramEmbedByLocationAndIdentity: () => null,
  deleteInstagramEmbedById: () => true,
  saveInstagramEmbed: (next: InstagramEmbed) => {
    embed = { ...next };
    return next.id!;
  },
  getUploadsByInstagramEmbedId: () => uploads,
  getUploadByInstagramItem: (_embedId: number, mediaKey: string) =>
    uploads.find((upload) => upload.instagramMediaKey === mediaKey) ?? null,
  saveUpload: (upload: Upload) => {
    if (!upload.id) {
      upload.id = uploads.length + 1;
      uploads.push(upload);
    }
    return upload.id;
  },
  isInstagramMediaRejected: () => false,
  getInstagramEmbedsForBackfill: () => [],
} as any);

const { InstagramImageStagingService } = await import("./instagram-image-staging.service");

let mediaResponse: InstagramMediaResponse = {
  imageUrls: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
  mediaType: "carousel" as const,
  eligibility: "photos-only" as const,
  items: [
    { key: "a", position: 0, mediaType: "photo" as const, imageUrl: "https://cdn.test/a.jpg" },
    { key: "b", position: 1, mediaType: "photo" as const, imageUrl: "https://cdn.test/b.jpg" },
  ],
  quota: { limit: null, remaining: null },
};
let failingUrl: string | null = null;
let apiError: Error | null = null;

const api = {
  isConfigured: () => true,
  fetchMediaUrls: mock(async () => {
    if (apiError) throw apiError;
    return mediaResponse;
  }),
};

const storage = {
  saveImagesFromUrls: mock(async (_urls: string[], _path: string) => ({ savedPaths: [], errors: [] })),
  generateStoragePath: mock(({ timestamp }: { timestamp: number | string }) => `/images/${timestamp}`),
  createStoragePath: mock((_location: string, _kind: string, timestamp: number | string) => `/images/${timestamp}`),
  saveSanitizedImageFromUrl: mock(async (url: string, path: string) => {
    if (url === failingUrl) throw new Error("download failed");
    return {
      path: `${path}/source_0.webp`,
      metadata: { width: 1600, height: 1200, size: 1000, format: "webp" },
    };
  }),
};

describe("InstagramImageStagingService", () => {
  afterEach(() => {
    uploads.length = 0;
    embed = { ...embed, images: [], original_image_urls: [], media_staging_status: "pending", media_staging_error: null, media_item_count: null, staged_item_count: null };
    failingUrl = null;
    apiError = null;
    storage.saveImagesFromUrls.mockClear();
  });

  test("stages every photo in an eligible carousel as an independent candidate", async () => {
    const result = await new InstagramImageStagingService(api as never, storage as never).stageEmbedMedia(42);

    expect(result.media_staging_status).toBe("ready");
    expect(result.media_item_count).toBe(2);
    expect(result.staged_item_count).toBe(2);
    expect(storage.saveImagesFromUrls.mock.calls[0]?.[0]).toEqual(["https://cdn.test/a.jpg"]);
    expect(uploads.map((upload) => ({
      key: upload.instagramMediaKey,
      position: upload.sourcePosition,
      credit: upload.imageSet?.photographerCredit,
      status: upload.stagedSourceStatus,
    }))).toEqual([
      { key: "a", position: 0, credit: "Public Place", status: "ready" },
      { key: "b", position: 1, credit: "Public Place", status: "ready" },
    ]);
  });

  test("keeps successful carousel candidates when one item fails", async () => {
    failingUrl = "https://cdn.test/b.jpg";
    const result = await new InstagramImageStagingService(api as never, storage as never).stageEmbedMedia(42);

    expect(result.media_staging_status).toBe("partial");
    expect(result.staged_item_count).toBe(1);
    expect(uploads.map((upload) => upload.stagedSourceStatus)).toEqual(["ready", "failed"]);
  });

  test("skips mixed carousels without creating candidates", async () => {
    mediaResponse = {
      ...mediaResponse,
      eligibility: "mixed",
      items: [
        mediaResponse.items[0]!,
        { key: "video", position: 1, mediaType: "video", imageUrl: "https://cdn.test/poster.jpg" },
      ],
    };
    const result = await new InstagramImageStagingService(api as never, storage as never).stageEmbedMedia(42);

    expect(result.media_staging_status).toBe("skipped");
    expect(uploads).toHaveLength(0);
  });

  test("keeps rate-limited backfill work pending for automatic resume", async () => {
    apiError = new InstagramApiError(429, "Instagram API error: 429 - rate limit");
    const result = await new InstagramImageStagingService(api as never, storage as never).stageEmbedMedia(42);

    expect(result.media_staging_status).toBe("pending");
    expect(result.media_staging_version).toBeNull();
  });

  test("persists a failed candidate when a photo item has no URL", async () => {
    mediaResponse = {
      imageUrls: [],
      mediaType: "single",
      eligibility: "photos-only",
      items: [{ key: "missing", position: 0, mediaType: "photo" }],
      quota: { limit: null, remaining: null },
    };
    const result = await new InstagramImageStagingService(api as never, storage as never).stageEmbedMedia(42);

    expect(result.media_staging_status).toBe("failed");
    expect(uploads.map((upload) => ({ key: upload.instagramMediaKey, status: upload.stagedSourceStatus }))).toEqual([
      { key: "missing", status: "failed" },
    ]);
  });
});
