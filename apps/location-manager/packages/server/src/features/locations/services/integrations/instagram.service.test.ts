import { afterEach, describe, expect, mock, test } from "bun:test";
import type { InstagramEmbed } from "../../models/location";

// Spies shared across mocked repository modules.
const updateLocationById = mock((_locationId: number, _updates: Record<string, unknown>) => true);
const saveInstagramEmbed = mock(() => 42);
const deleteInstagramEmbedById = mock(() => true);
const getInstagramEmbedByLocationAndUrl = mock((_locationId: number, url: string) =>
  url.endsWith("/") ? storedEmbed : null
);

let storedEmbed: InstagramEmbed | null = null;

mock.module("../../repositories/core", () => ({
  getLocationById: () => ({ id: 7, name: "Pucllana Site Museum" }),
  updateLocationById,
}));

mock.module("../../repositories/content", () => ({
  saveInstagramEmbed,
  getInstagramEmbedById: (id: number) => storedEmbed?.id === id ? storedEmbed : null,
  deleteInstagramEmbedById,
  getInstagramEmbedByLocationAndUrl,
  getInstagramEmbedsForBackfill: () => [],
  getUploadByInstagramItem: () => null,
  getUploadsByInstagramEmbedId: () => [],
  saveUpload: () => 1,
  isInstagramMediaRejected: () => false,
}));

// Imported after mocks so the service binds to the mocked repositories.
const { InstagramService } = await import("./instagram.service");

const apiClient = { isConfigured: () => false } as any;
const imageStorage = {} as any;

function lastUpdateCall() {
  return updateLocationById.mock.calls.at(-1);
}

describe("InstagramService out-of-sync flagging", () => {
  afterEach(() => {
    updateLocationById.mockClear();
    saveInstagramEmbed.mockClear();
    deleteInstagramEmbedById.mockClear();
    getInstagramEmbedByLocationAndUrl.mockClear();
    storedEmbed = null;
  });

  test("addInstagramEmbed bumps the location's updated_at", async () => {
    const service = new InstagramService(apiClient, imageStorage);

    const embedCode =
      '<blockquote data-instgrm-permalink="https://www.instagram.com/p/ABC123/?utm=1">' +
      "A post shared by @explorer</blockquote>";

    await service.addInstagramEmbed({ embedCode, locationId: 7 } as any);

    expect(updateLocationById).toHaveBeenCalledTimes(1);
    const [locationId, updates] = lastUpdateCall()!;
    expect(locationId).toBe(7);
    expect((updates as { updated_at?: string }).updated_at).toBeTruthy();
  });

  test("deleteInstagramEmbed bumps the location's updated_at", async () => {
    storedEmbed = {
      id: 42,
      location_id: 7,
      username: "@explorer",
      url: "https://www.instagram.com/p/ABC123/",
      embed_code: "<blockquote></blockquote>",
      images: [],
      original_image_urls: [],
    };

    const service = new InstagramService(apiClient, imageStorage);

    await service.deleteInstagramEmbed(42);

    expect(updateLocationById).toHaveBeenCalledTimes(1);
    const [locationId, updates] = lastUpdateCall()!;
    expect(locationId).toBe(7);
    expect((updates as { updated_at?: string }).updated_at).toBeTruthy();
  });

  test("re-adding the same normalized post returns the existing embed", async () => {
    storedEmbed = {
      id: 99,
      location_id: 7,
      username: "@explorer",
      url: "https://www.instagram.com/p/ABC123/",
      embed_code: "existing",
      images: [],
      original_image_urls: [],
      media_staging_status: "ready",
    };
    const service = new InstagramService(apiClient, imageStorage);
    const result = await service.addInstagramEmbed({
      locationId: 7,
      embedCode: '<blockquote data-instgrm-permalink="https://www.instagram.com/p/ABC123?utm=1">A post shared by @explorer</blockquote>',
    } as any);

    expect(result.id).toBe(99);
  });
});
