import { describe, expect, test } from "bun:test";
import type { LocationResponse } from "../../../models/location";
import { uploadLocationImages } from "./media-upload.handler";

describe("uploadLocationImages", () => {
  test("skips unfinalized staged sources without failing gallery sync", async () => {
    const payloadClient = { createInstagramPost: async () => "unused" };
    const location = {
      id: 1,
      source: { name: "Pending", address: "" },
      uploads: [{
        id: 10,
        location_id: 1,
        format: "imageset",
        stagedSourceStatus: "ready",
        sourceKind: "instagram",
        imageSet: {
          id: "pending",
          sourceImage: { path: "source.webp", dimensions: { width: 10, height: 10 }, size: 10, format: "webp" },
          variants: [],
          photographerCredit: "Pending",
          created_at: new Date().toISOString(),
        },
      }],
      instagram_embeds: [],
    } as unknown as LocationResponse;

    const result = await uploadLocationImages(location, payloadClient as any, {} as any);

    expect(result.galleryImageIds).toEqual([]);
    expect(result.galleryUploadFailures).toBe(0);
  });

  test("syncs an Instagram embed when no private preview is available", async () => {
    const posts: Array<Record<string, unknown>> = [];
    const payloadClient = {
      createInstagramPost: async (post: Record<string, unknown>) => {
        posts.push(post);
        return "instagram-post-1";
      },
    };
    const location = {
      id: 2,
      title: "Previewless",
      source: { name: "Previewless", address: "" },
      uploads: [],
      instagram_embeds: [{
        id: 20,
        location_id: 2,
        username: "@previewless",
        url: "https://www.instagram.com/p/POST/",
        embed_code: "<blockquote></blockquote>",
        images: [],
        original_image_urls: [],
      }],
    } as unknown as LocationResponse;

    const result = await uploadLocationImages(location, payloadClient as any, {} as any);

    expect(result.instagramPostIds).toEqual(["instagram-post-1"]);
    expect(posts[0]).not.toHaveProperty("previewImage");
  });

  test("uses resolved locationRef for uploads and instagram previews", async () => {
    const uploadCalls: Array<{
      filename: string;
      locationRef?: string;
      photographerCredit?: string;
    }> = [];

    const payloadClient = {
      findMediaSetByExternalRef: async () => null,
      createMediaSet: async () => "media-set-1",
      uploadImage: async (
        _buffer: Buffer,
        filename: string,
        _altText: string,
        options?: { locationRef?: string; photographerCredit?: string }
      ) => {
        uploadCalls.push({
          filename,
          locationRef: options?.locationRef,
          photographerCredit: options?.photographerCredit,
        });
        return `media-asset-${uploadCalls.length}`;
      },
      createInstagramPost: async () => "instagram-post-1",
    };

    const imageStorage = {
      readImage: async (_path: string) => Buffer.from("image-bytes"),
    };

    const location = {
      id: 42,
      title: "Test Location",
      source: {
        name: "Test Location",
        address: "123 Test St",
      },
      locationKey: "peru|lima|miraflores",
      payload_location_ref: null,
      uploads: [
        {
          id: 1,
          location_id: 42,
          format: "imageset",
          imageSet: {
            id: "imgset-1",
            sourceImage: {
              path: "packages/server/data/images/test/uploads/source.webp",
              dimensions: { width: 1600, height: 1200 },
              size: 1000,
              format: "webp",
            },
            variants: [
              {
                type: "thumbnail",
                aspectRatio: "3:2",
                dimensions: { width: 300, height: 200 },
                path: "packages/server/data/images/test/uploads/thumbnail.webp",
                size: 1200,
                format: "webp",
              },
            ],
            photographerCredit: "Test Credit",
            altText: "Test alt text",
            created_at: new Date().toISOString(),
          },
        },
      ],
      instagram_embeds: [
        {
          id: 5,
          location_id: 42,
          username: "@testuser",
          url: "https://instagram.com/p/test/",
          embed_code: "<blockquote>test</blockquote>",
          images: ["packages/server/data/images/test/instagram/preview.webp"],
          original_image_urls: ["https://example.com/preview.webp"],
        },
      ],
    } as unknown as LocationResponse;

    const result = await uploadLocationImages(
      location,
      payloadClient as any,
      imageStorage as any,
      "987"
    );

    expect(result.galleryImageIds).toEqual(["media-set-1"]);
    expect(result.instagramPostIds).toEqual(["instagram-post-1"]);
    expect(uploadCalls).toHaveLength(2);
    expect(uploadCalls[0]?.locationRef).toBe("987");
    expect(uploadCalls[0]?.photographerCredit).toBe("Test Credit");
    expect(uploadCalls[0]?.filename).toContain("imgset-1_thumbnail.webp");
    expect(uploadCalls[1]?.locationRef).toBe("987");
    expect(uploadCalls[1]?.photographerCredit).toBe("@testuser");
    expect(uploadCalls[1]?.filename).toContain("instagram_test.webp");
  });

  test("refreshes existing media-set variants and backfills locationRef", async () => {
    const uploadedVariantCalls: Array<{
      filename: string;
      locationRef?: string;
      photographerCredit?: string;
    }> = [];
    const mediaSetLocationRefCalls: Array<{ mediaSetId: string; locationRef: string }> = [];
    const mediaAssetLocationRefCalls: Array<{ mediaAssetId: string; locationRef: string }> = [];
    const detachedVariantCalls: string[] = [];

    const payloadClient = {
      findMediaSetByExternalRef: async () => "media-set-existing",
      createMediaSet: async () => "should-not-create",
      getMediaSetVariantAssetIds: async () => ["asset-a", "asset-b"],
      setMediaSetLocationRef: async (mediaSetId: string, locationRef: string) => {
        mediaSetLocationRefCalls.push({ mediaSetId, locationRef });
      },
      updateMediaAssetLocationRef: async (mediaAssetId: string, locationRef: string) => {
        mediaAssetLocationRefCalls.push({ mediaAssetId, locationRef });
      },
      detachMediaAssetFromMediaSet: async (mediaAssetId: string) => {
        detachedVariantCalls.push(mediaAssetId);
      },
      uploadImage: async (
        _buffer: Buffer,
        filename: string,
        _altText: string,
        options?: { locationRef?: string; photographerCredit?: string }
      ) => {
        uploadedVariantCalls.push({
          filename,
          locationRef: options?.locationRef,
          photographerCredit: options?.photographerCredit,
        });
        return "unexpected-upload";
      },
      createInstagramPost: async () => "instagram-post-unused",
    };

    const imageStorage = {
      readImage: async (_path: string) => Buffer.from("image-bytes"),
    };

    const location = {
      id: 7,
      title: "Existing Sync Location",
      source: {
        name: "Existing Sync Location",
        address: "456 Existing St",
      },
      locationKey: "peru|lima|barranco",
      payload_location_ref: null,
      uploads: [
        {
          id: 2,
          location_id: 7,
          format: "imageset",
          imageSet: {
            id: "imgset-existing",
            sourceImage: {
              path: "packages/server/data/images/test/uploads/source.webp",
              dimensions: { width: 1600, height: 1200 },
              size: 1000,
              format: "webp",
            },
            variants: [
              {
                type: "thumbnail",
                aspectRatio: "3:2",
                dimensions: { width: 300, height: 200 },
                path: "packages/server/data/images/test/uploads/thumbnail.webp",
                size: 1200,
                format: "webp",
              },
            ],
            photographerCredit: "Existing Credit",
            altText: "Existing media",
            created_at: new Date().toISOString(),
          },
        },
      ],
      instagram_embeds: [],
    } as unknown as LocationResponse;

    const result = await uploadLocationImages(
      location,
      payloadClient as any,
      imageStorage as any,
      "654"
    );

    expect(result.galleryImageIds).toEqual(["media-set-existing"]);
    expect(result.instagramPostIds).toEqual([]);
    expect(uploadedVariantCalls).toHaveLength(1);
    expect(uploadedVariantCalls[0]).toEqual({
      filename: "existing-sync-location_imgset-existing_thumbnail.webp",
      locationRef: "654",
      photographerCredit: "Existing Credit",
    });
    expect(mediaSetLocationRefCalls).toEqual([
      { mediaSetId: "media-set-existing", locationRef: "654" },
    ]);
    expect(mediaAssetLocationRefCalls).toEqual([
      { mediaAssetId: "asset-a", locationRef: "654" },
      { mediaAssetId: "asset-b", locationRef: "654" },
    ]);
    expect(detachedVariantCalls).toEqual(["asset-a", "asset-b"]);
  });

  test("fails sync when an image set is missing photographer credit", async () => {
    const payloadClient = {
      findMediaSetByExternalRef: async () => null,
      createMediaSet: async () => "media-set-1",
      uploadImage: async () => "media-asset-1",
      createInstagramPost: async () => "instagram-post-1",
    };

    const imageStorage = {
      readImage: async (_path: string) => Buffer.from("image-bytes"),
    };

    const location = {
      id: 88,
      title: "Missing Credit Location",
      source: {
        name: "Missing Credit Location",
        address: "123 Missing Credit Ave",
      },
      locationKey: "peru|lima|miraflores",
      payload_location_ref: "777",
      uploads: [
        {
          id: 9,
          location_id: 88,
          format: "imageset",
          imageSet: {
            id: "imgset-missing-credit",
            sourceImage: {
              path: "packages/server/data/images/test/uploads/source.webp",
              dimensions: { width: 1600, height: 1200 },
              size: 1000,
              format: "webp",
            },
            variants: [
              {
                type: "thumbnail",
                aspectRatio: "3:2",
                dimensions: { width: 300, height: 200 },
                path: "packages/server/data/images/test/uploads/thumbnail.webp",
                size: 1200,
                format: "webp",
              },
            ],
            photographerCredit: "   ",
            altText: "Test alt text",
            created_at: new Date().toISOString(),
          },
        },
      ],
      instagram_embeds: [],
    } as unknown as LocationResponse;

    await expect(
      uploadLocationImages(location, payloadClient as any, imageStorage as any, "777")
    ).rejects.toThrow("Missing photographer credit");
  });

  test("uses Unknown photographer credit for instagram previews without username", async () => {
    const uploadCalls: Array<{ photographerCredit?: string }> = [];

    const payloadClient = {
      findMediaSetByExternalRef: async () => null,
      createMediaSet: async () => "media-set-unused",
      uploadImage: async (
        _buffer: Buffer,
        _filename: string,
        _altText: string,
        options?: { photographerCredit?: string }
      ) => {
        uploadCalls.push({ photographerCredit: options?.photographerCredit });
        return "media-asset-instagram";
      },
      createInstagramPost: async () => "instagram-post-unknown",
    };

    const imageStorage = {
      readImage: async (_path: string) => Buffer.from("image-bytes"),
    };

    const location = {
      id: 51,
      title: "Instagram Unknown Credit",
      source: {
        name: "Instagram Unknown Credit",
        address: "123 Unknown Ln",
      },
      locationKey: "peru|lima|surco",
      payload_location_ref: "321",
      uploads: [],
      instagram_embeds: [
        {
          id: 1,
          location_id: 51,
          username: "   ",
          url: "https://instagram.com/p/unknown/",
          embed_code: "<blockquote>unknown</blockquote>",
          images: ["packages/server/data/images/test/instagram/preview.webp"],
          original_image_urls: ["https://example.com/preview.webp"],
        },
      ],
    } as unknown as LocationResponse;

    const result = await uploadLocationImages(
      location,
      payloadClient as any,
      imageStorage as any,
      "321"
    );

    expect(result.instagramPostIds).toEqual(["instagram-post-unknown"]);
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0]?.photographerCredit).toBe("Unknown");
  });

  test("counts image sets with no variants as gallery upload failures", async () => {
    const payloadClient = {
      findMediaSetByExternalRef: async () => {
        throw new Error("should not check Payload for an empty image set");
      },
      createMediaSet: async () => "media-set-unused",
      uploadImage: async () => "media-asset-unused",
      createInstagramPost: async () => "instagram-post-unused",
    };

    const imageStorage = {
      readImage: async (_path: string) => Buffer.from("image-bytes"),
    };

    const location = {
      id: 91,
      title: "Empty ImageSet Location",
      source: {
        name: "Empty ImageSet Location",
        address: "123 Empty Ln",
      },
      locationKey: "peru|lima|miraflores",
      payload_location_ref: "777",
      uploads: [
        {
          id: 12,
          location_id: 91,
          format: "imageset",
          imageSet: {
            id: "imgset-empty",
            sourceImage: {
              path: "packages/server/data/images/test/uploads/source.webp",
              dimensions: { width: 1600, height: 1200 },
              size: 1000,
              format: "webp",
            },
            variants: [],
            photographerCredit: "Test Credit",
            altText: "Empty image set",
            created_at: new Date().toISOString(),
          },
        },
      ],
      instagram_embeds: [],
    } as unknown as LocationResponse;

    const result = await uploadLocationImages(
      location,
      payloadClient as any,
      imageStorage as any,
      "777"
    );

    expect(result).toEqual({
      galleryImageIds: [],
      instagramPostIds: [],
      galleryUploadFailures: 1,
    });
  });
});
