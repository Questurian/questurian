import sharp from "sharp";

export const UPLOAD_WEBP_QUALITY = 85;

/**
 * Re-encode uploaded images into a fresh WebP buffer.
 * Sharp omits metadata by default, so EXIF/IPTC/XMP/ICC/comments are not copied.
 * `rotate()` applies EXIF orientation before metadata is dropped.
 */
export async function sanitizeUploadedImageBuffer(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .webp({ quality: UPLOAD_WEBP_QUALITY })
    .toBuffer();
}
