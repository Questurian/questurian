import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { sanitizeUploadedImageBuffer } from "./image-upload-sanitizer";

describe("sanitizeUploadedImageBuffer", () => {
  test("re-encodes uploads as metadata-free WebP", async () => {
    const input = await sharp({
      create: {
        width: 16,
        height: 12,
        channels: 3,
        background: "#3b82f6",
      },
    })
      .jpeg()
      .withMetadata({
        exif: {
          IFD0: {
            Copyright: "do-not-persist",
          },
        },
      })
      .toBuffer();

    const inputMeta = await sharp(input).metadata();
    expect(inputMeta.exif).toBeInstanceOf(Buffer);
    expect(inputMeta.hasProfile).toBe(true);

    const output = await sanitizeUploadedImageBuffer(input);
    const outputMeta = await sharp(output).metadata();

    expect(outputMeta.format).toBe("webp");
    expect(outputMeta.width).toBe(16);
    expect(outputMeta.height).toBe(12);
    expect(outputMeta.exif).toBeUndefined();
    expect(outputMeta.icc).toBeUndefined();
    expect(outputMeta.xmp).toBeUndefined();
    expect(outputMeta.hasProfile).toBe(false);
  });
});
