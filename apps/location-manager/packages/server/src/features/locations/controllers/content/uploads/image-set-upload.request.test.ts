import { describe, expect, test } from "bun:test";
import { BadRequestError } from "@shared/errors/http-error";
import {
  parseNewImageSetUploadRequest,
  parseReplacementImageSetUploadRequest,
  REQUIRED_VARIANT_TYPES,
} from "./image-set-upload.request";

function imageFile(name: string, type = "image/jpeg"): File {
  return new File(["image-bytes"], name, { type });
}

function completeImageSetFormData(): FormData {
  const formData = new FormData();
  formData.set("source_0", imageFile("source.jpg"));
  for (const type of REQUIRED_VARIANT_TYPES) {
    formData.set(`variant_0_${type}`, imageFile(`${type}.webp`, "image/webp"));
  }
  return formData;
}

describe("image-set upload request parsing", () => {
  test("normalizes new upload metadata and attaches crop regions", () => {
    const formData = completeImageSetFormData();
    formData.set("photographerCredit", "  Jane Doe  ");
    formData.set("altText", "  A market at dusk  ");
    formData.set(
      "cropRegions_0",
      JSON.stringify({
        square: { left: 10, top: 20, width: 300, height: 300 },
      }),
    );

    const request = parseNewImageSetUploadRequest(formData);

    expect(request.photographerCredit).toBe("Jane Doe");
    expect(request.altText).toBe("A market at dusk");
    expect(request.variantFiles.map(({ type }) => type)).toEqual([
      ...REQUIRED_VARIANT_TYPES,
    ]);
    expect(
      request.variantFiles.find(({ type }) => type === "square")?.cropRegion,
    ).toEqual({ left: 10, top: 20, width: 300, height: 300 });
  });

  test("preserves replacement alt text for service-level normalization", () => {
    const formData = completeImageSetFormData();
    formData.set("altText", "  replacement text  ");

    const request = parseReplacementImageSetUploadRequest(formData);

    expect(request.altText).toBe("  replacement text  ");
  });

  test("rejects a missing configured variant with the existing message", () => {
    const formData = completeImageSetFormData();
    formData.set("photographerCredit", "Jane Doe");
    formData.delete("variant_0_hero");

    expect(() => parseNewImageSetUploadRequest(formData)).toThrow(
      "Missing variant file: hero (expected key: variant_0_hero)",
    );
  });

  test("rejects unknown crop-region keys", () => {
    const formData = completeImageSetFormData();
    formData.set("photographerCredit", "Jane Doe");
    formData.set(
      "cropRegions_0",
      JSON.stringify({
        social: { left: 0, top: 0, width: 100, height: 100 },
      }),
    );

    expect(() => parseNewImageSetUploadRequest(formData)).toThrow(
      new BadRequestError("cropRegions_0 has unknown variant key: social"),
    );
  });
});
