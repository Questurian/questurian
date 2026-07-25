import { describe, expect, test } from "bun:test";
import type { ImageSetUpload, Upload } from "../../../models/location";
import type { GooglePlacePhoto } from "../clients/google-places-photos.client";
import { annotateGooglePhotos } from "./google-photo-preview.service";

const photos: GooglePlacePhoto[] = [
  buildPhoto("imported"),
  buildPhoto("staged"),
  buildPhoto("rejected"),
  buildPhoto("new"),
];

describe("annotateGooglePhotos", () => {
  test("assigns imported, staged, rejected, and new statuses by precedence", () => {
    const uploads = new Map<string, Upload>([
      ["imported", buildUpload(1, "imported", true)],
      ["staged", buildUpload(2, "staged", false)],
    ]);

    const result = annotateGooglePhotos(
      photos,
      uploads,
      new Set(["imported", "staged", "rejected"]),
      [null, "staged-preview", "rejected-preview", "new-preview"],
    );

    expect(result.map(({ status }) => status)).toEqual([
      "imported",
      "staged",
      "rejected",
      "new",
    ]);
    expect(result[0]?.uploadId).toBe(1);
    expect(result[1]?.previewUrl).toBe("staged-preview");
  });

  test("preserves attribution links and staged-source errors", () => {
    const failed = buildUpload(3, "new", false);
    failed.errorMessage = "download failed";

    const [result] = annotateGooglePhotos(
      [buildPhoto("new")],
      new Map([["new", failed]]),
      new Set(),
      ["preview"],
    );

    expect(result?.authorAttributions).toEqual([
      { displayName: "Photographer", uri: "https://example.test/author" },
    ]);
    expect(result?.errorMessage).toBe("download failed");
  });
});

function buildPhoto(name: string): GooglePlacePhoto {
  return {
    name,
    widthPx: 1200,
    heightPx: 800,
    authorAttributions: [{
      displayName: "Photographer",
      uri: "https://example.test/author",
    }],
  };
}

function buildUpload(
  id: number,
  photoName: string,
  imported: boolean,
): ImageSetUpload {
  return {
    id,
    location_id: 10,
    format: "imageset",
    googlePhotoName: photoName,
    imageSet: imported
      ? {
          id: `${id}`,
          sourceImage: {
            path: "images/source.webp",
            dimensions: { width: 1200, height: 800 },
            size: 100,
            format: "webp",
          },
          variants: [{
            type: "square",
            aspectRatio: "1:1",
            path: "images/square.webp",
            dimensions: { width: 600, height: 600 },
            size: 50,
            format: "webp",
          }],
          created_at: "2026-07-25T00:00:00.000Z",
        }
      : undefined,
  };
}
