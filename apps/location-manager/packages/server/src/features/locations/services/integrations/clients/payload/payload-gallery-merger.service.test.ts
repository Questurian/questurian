import { describe, expect, mock, test } from "bun:test";
import { PayloadGalleryMergerService } from "./payload-gallery-merger.service";

describe("PayloadGalleryMergerService", () => {
  test("replaces gallery when replaceGallery is enabled", async () => {
    const findEntryByTitle = mock(async () => "doc-1");
    const getEntryById = mock(async () => ({
      message: "",
      doc: {
        id: "doc-1",
        title: "Museum",
        gallery: [
          {
            id: "row-1",
            image: {
              id: "existing-1",
              filename: "existing-1.webp",
              url: "/existing-1.webp",
            },
          },
          {
            id: "row-2",
            image: {
              id: "existing-2",
              filename: "existing-2.webp",
              url: "/existing-2.webp",
            },
          },
        ],
        instagramGallery: [],
        status: "published" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }));

    const service = new PayloadGalleryMergerService({
      findEntryByTitle,
      getEntryById,
    } as never);

    const result = await service.prepareUpsert(
      "attractions",
      {
        title: "Museum",
        gallery: [
          { image: "uploaded-1", altText: "", caption: "" },
          { image: "selected-2", altText: "", caption: "" },
        ],
        instagramGallery: [],
        status: "published",
      },
      {
        replaceGallery: true,
      }
    );

    expect(result.existingDocId).toBe("doc-1");
    expect(result.mergedData.gallery.map((item) => item.image)).toEqual([
      "uploaded-1",
      "selected-2",
    ]);
  });

  test("keeps merge behavior when replaceGallery is not enabled", async () => {
    const service = new PayloadGalleryMergerService({
      findEntryByTitle: mock(async () => "doc-2"),
      getEntryById: mock(async () => ({
        message: "",
        doc: {
          id: "doc-2",
          title: "Museum",
          gallery: [
            {
              id: "row-1",
              image: {
                id: "existing-1",
                filename: "existing-1.webp",
                url: "/existing-1.webp",
              },
            },
          ],
          instagramGallery: [],
          status: "published" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      })),
    } as never);

    const result = await service.prepareUpsert("dining", {
      title: "Museum",
      gallery: [
        { image: "existing-1", altText: "", caption: "" },
        { image: "new-2", altText: "", caption: "" },
      ],
      instagramGallery: [],
      status: "published",
    });

    expect(result.mergedData.gallery.map((item) => item.image)).toEqual([
      "existing-1",
      "new-2",
    ]);
  });

  test("dedupes numeric and string forms of the same relationship id", async () => {
    const service = new PayloadGalleryMergerService({
      findEntryByTitle: mock(async () => "doc-3"),
      getEntryById: mock(async () => ({
        message: "",
        doc: {
          id: "doc-3",
          title: "Museum",
          gallery: [
            {
              id: "row-1",
              image: {
                id: 42,
                filename: "existing-42.webp",
                url: "/existing-42.webp",
              },
            },
          ],
          instagramGallery: [],
          status: "published" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      })),
    } as never);

    const result = await service.prepareUpsert("attractions", {
      title: "Museum",
      gallery: [
        { image: "42", altText: "", caption: "" },
        { image: "99", altText: "", caption: "" },
      ],
      instagramGallery: [],
      status: "published",
    });

    expect(result.mergedData.gallery.map((item) => item.image)).toEqual([42, 99]);
  });
});
